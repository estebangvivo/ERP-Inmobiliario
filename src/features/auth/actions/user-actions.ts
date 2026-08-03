"use server";

import { revalidatePath } from "next/cache";
import type { OrganizationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgAdmin, requireSession } from "@/lib/session";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/features/auth/lib/password";
import {
  ORG_MODULE_KEYS,
  type AppModuleKey,
} from "@/features/auth/lib/modules";

export type UserActionResult =
  | { ok: true; userId?: string }
  | { ok: false; error: string };

export type OrganizationUserRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  allowedModules: string[];
  isActive: boolean;
};

async function assertCanManageUsers(organizationId: string) {
  const session = await requireSession();
  const isSuper = isPlatformSuperadminEmail(session.user.email);
  if (session.organizationRole !== "ADMIN" && !isSuper) {
    throw new Error("FORBIDDEN");
  }
  if (!isSuper && session.organizationId !== organizationId) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

function assertNotProtectingPlatformSuperadmin(
  actorEmail: string,
  targetEmail: string,
): UserActionResult | null {
  if (!isPlatformSuperadminEmail(targetEmail)) return null;
  if (isPlatformSuperadminEmail(actorEmail)) return null;
  return {
    ok: false,
    error: "No podés gestionar la cuenta de superadmin de plataforma.",
  };
}

export async function listOrganizationUsers(
  organizationId?: string,
): Promise<OrganizationUserRow[]> {
  const session = await requireSession();
  const orgId = organizationId ?? session.organizationId;
  await assertCanManageUsers(orgId);

  const viewerIsSuper = isPlatformSuperadminEmail(session.user.email);

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: orgId },
    include: { user: true },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
  });

  return members
    .filter((m) => {
      // Los admins de inmobiliaria no ven ni gestionan al superadmin.
      if (viewerIsSuper) return true;
      return !isPlatformSuperadminEmail(m.user.email);
    })
    .map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      allowedModules: m.allowedModules,
      isActive: m.user.isActive,
    }));
}

export async function createOrganizationUser(input: {
  organizationId?: string;
  name: string;
  email: string;
  password: string;
  role: OrganizationRole;
  allowedModules?: AppModuleKey[];
  phone?: string;
}): Promise<UserActionResult> {
  try {
    const session = await requireSession();
    const orgId = input.organizationId ?? session.organizationId;
    await assertCanManageUsers(orgId);

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (
      isPlatformSuperadminEmail(email) &&
      !isPlatformSuperadminEmail(session.user.email)
    ) {
      return {
        ok: false,
        error: "Ese email está reservado para la plataforma.",
      };
    }
    const pwdCheck = validatePasswordStrength(input.password);
    if (!pwdCheck.ok) return { ok: false, error: pwdCheck.error };
    if (name.length < 2) return { ok: false, error: "Nombre requerido." };

    const modules = (input.allowedModules ?? []).filter((m) =>
      ORG_MODULE_KEYS.includes(m),
    );

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          authId: `local:${email}`,
          email,
          name,
          phone: input.phone?.trim() || null,
          passwordHash: await hashPassword(input.password),
        },
      });
    }

    const existing = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: user.id },
      },
    });
    if (existing) {
      return { ok: false, error: "Ese usuario ya pertenece a la empresa." };
    }

    await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        role: input.role,
        allowedModules: modules,
      },
    });

    revalidatePath("/usuarios");
    revalidatePath("/admin");
    return { ok: true, userId: user.id };
  } catch (error) {
    console.error("createOrganizationUser", error);
    return { ok: false, error: "No se pudo crear el usuario." };
  }
}

export async function updateOrganizationUser(input: {
  organizationId?: string;
  userId: string;
  name?: string;
  role?: OrganizationRole;
  allowedModules?: AppModuleKey[];
  isActive?: boolean;
  password?: string;
}): Promise<UserActionResult> {
  try {
    const session = await requireSession();
    const orgId = input.organizationId ?? session.organizationId;
    await assertCanManageUsers(orgId);

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: input.userId,
        },
      },
      include: { user: true },
    });
    if (!membership) {
      return { ok: false, error: "Usuario no encontrado en la empresa." };
    }

    const blocked = assertNotProtectingPlatformSuperadmin(
      session.user.email,
      membership.user.email,
    );
    if (blocked) return blocked;

    const userData: {
      name?: string;
      isActive?: boolean;
      passwordHash?: string;
    } = {};
    if (input.name) userData.name = input.name.trim();
    if (typeof input.isActive === "boolean") userData.isActive = input.isActive;
    if (input.password) {
      const pwdCheck = validatePasswordStrength(input.password);
      if (!pwdCheck.ok) return { ok: false, error: pwdCheck.error };
      userData.passwordHash = await hashPassword(input.password);
    }

    if (Object.keys(userData).length > 0) {
      await prisma.user.update({
        where: { id: input.userId },
        data: userData,
      });
    }

    const memberData: {
      role?: OrganizationRole;
      allowedModules?: string[];
    } = {};
    if (input.role) memberData.role = input.role;
    if (input.allowedModules) {
      memberData.allowedModules = input.allowedModules.filter((m) =>
        ORG_MODULE_KEYS.includes(m),
      );
    }

    if (Object.keys(memberData).length > 0) {
      await prisma.organizationMember.update({
        where: { id: membership.id },
        data: memberData,
      });
    }

    revalidatePath("/usuarios");
    revalidatePath("/admin");
    return { ok: true, userId: input.userId };
  } catch (error) {
    console.error("updateOrganizationUser", error);
    return { ok: false, error: "No se pudo actualizar el usuario." };
  }
}

export async function getMyAssignedTurneroPuesto(): Promise<{
  id: string;
  nombre: string;
  categoria: string;
} | null> {
  try {
    const session = await requireSession();
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: session.organizationId,
          userId: session.user.id,
        },
      },
      include: { turneroPuesto: true },
    });

    const puesto = membership?.turneroPuesto;
    if (!puesto?.activo) return null;

    return {
      id: puesto.id,
      nombre: puesto.nombre,
      categoria: puesto.categoria,
    };
  } catch {
    return null;
  }
}

export async function removeOrganizationUser(input: {
  organizationId?: string;
  userId: string;
}): Promise<UserActionResult> {
  try {
    const session = await requireSession();
    const orgId = input.organizationId ?? session.organizationId;
    await assertCanManageUsers(orgId);

    if (input.userId === session.user.id) {
      return { ok: false, error: "No podés eliminarte a vos mismo." };
    }

    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!target) return { ok: false, error: "Usuario no encontrado." };

    const blocked = assertNotProtectingPlatformSuperadmin(
      session.user.email,
      target.email,
    );
    if (blocked) return blocked;

    await prisma.organizationMember.deleteMany({
      where: { organizationId: orgId, userId: input.userId },
    });

    revalidatePath("/usuarios");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("removeOrganizationUser", error);
    return { ok: false, error: "No se pudo quitar el usuario." };
  }
}
