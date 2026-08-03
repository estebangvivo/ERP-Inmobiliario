import type { OrganizationRole, User } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  resolveAllowedModules,
  type AppModuleKey,
} from "@/features/auth/lib/modules";
import {
  clearLocalSessionCookie,
  readLocalSessionFromCookies,
} from "@/features/auth/lib/session";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";

export type SessionContext = {
  user: User;
  organizationId: string | null;
  organizationRole: OrganizationRole | null;
  role: OrganizationRole | null;
  allowedModules: AppModuleKey[];
};

export type OrganizationSession = SessionContext & {
  organizationId: string;
  organizationRole: OrganizationRole;
  role: OrganizationRole;
};

export function hasOrganization(
  session: SessionContext,
): session is OrganizationSession {
  return Boolean(
    session.organizationId && session.organizationRole && session.role,
  );
}

async function sessionFromMembership(
  user: User,
  organizationId: string,
  organizationRole: OrganizationRole,
  allowedModulesStored: string[],
): Promise<SessionContext> {
  return {
    user,
    organizationId,
    organizationRole,
    role: organizationRole,
    allowedModules: resolveAllowedModules(
      organizationRole,
      allowedModulesStored,
    ),
  };
}

function sessionWithoutOrg(user: User): SessionContext {
  if (isPlatformSuperadminEmail(user.email)) {
    return {
      user,
      organizationId: null,
      organizationRole: "ADMIN",
      role: "ADMIN",
      allowedModules: ["admin", "home"],
    };
  }
  return {
    user,
    organizationId: null,
    organizationRole: null,
    role: null,
    allowedModules: ["home"],
  };
}

async function touchIdleCheck(
  userId: string,
  organizationId: string | null,
): Promise<boolean> {
  let idleMinutes = 30;
  let lastActivityAt: Date | null = null;
  try {
    if (organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { sessionIdleMinutes: true },
      });
      idleMinutes = Math.min(
        480,
        Math.max(5, org?.sessionIdleMinutes ?? 30),
      );
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActivityAt: true },
    });
    lastActivityAt = user?.lastActivityAt ?? null;
  } catch (error) {
    console.warn("touchIdleCheck", error);
    return true;
  }

  if (lastActivityAt) {
    const idleMs = idleMinutes * 60_000;
    if (Date.now() - lastActivityAt.getTime() > idleMs) {
      await clearLocalSessionCookie();
      return false;
    }
  }

  // Touch activity (best-effort)
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActivityAt: new Date() },
    });
  } catch {
    /* ignore */
  }
  return true;
}

async function getLocalCookieSession(): Promise<SessionContext | null> {
  const local = await readLocalSessionFromCookies();
  if (!local) return null;

  const user = await prisma.user.findFirst({
    where: { id: local.userId, isActive: true },
  });
  if (!user) return null;

  if (!local.organizationId) {
    const ok = await touchIdleCheck(user.id, null);
    if (!ok) return null;
    return sessionWithoutOrg(user);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: local.organizationId,
        userId: user.id,
      },
    },
  });

  if (!membership) {
    if (isPlatformSuperadminEmail(user.email)) {
      const org = await prisma.organization.findUnique({
        where: { id: local.organizationId },
        select: { id: true },
      });
      if (org) {
        const ok = await touchIdleCheck(user.id, org.id);
        if (!ok) return null;
        return sessionFromMembership(user, org.id, "ADMIN", []);
      }
    }
    const ok = await touchIdleCheck(user.id, null);
    if (!ok) return null;
    return sessionWithoutOrg(user);
  }

  const ok = await touchIdleCheck(user.id, membership.organizationId);
  if (!ok) return null;

  return sessionFromMembership(
    user,
    membership.organizationId,
    membership.role,
    membership.allowedModules,
  );
}

export async function getSession(): Promise<SessionContext | null> {
  try {
    return await getLocalCookieSession();
  } catch (error) {
    console.error("getSession", error);
    return null;
  }
}

export async function requireSession(): Promise<OrganizationSession> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  if (!hasOrganization(session)) throw new Error("NO_ORGANIZATION");
  return session;
}

export async function requireAuthSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function requireAdminPanelSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isPlatformSuperadminEmail(session.user.email)) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireOrganizationSession(): Promise<OrganizationSession> {
  return requireSession();
}

export async function getOrganizationSession(): Promise<OrganizationSession | null> {
  const session = await getSession();
  if (!session || !hasOrganization(session)) return null;
  return session;
}

/** Compat NextAuth-style helper usado en layouts/PDF. */
export async function auth() {
  const session = await getSession();
  if (!session) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.role,
      organizationId: session.organizationId,
      organizationRole: session.organizationRole,
      allowedModules: session.allowedModules,
    },
  };
}
