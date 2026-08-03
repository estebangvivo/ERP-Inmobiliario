import type { OrganizationRole } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  getSession,
  hasOrganization,
  requireSession as requireOrgSession,
  type OrganizationSession,
} from "@/lib/auth";
import { hasModule, type AppModuleKey } from "@/features/auth/lib/modules";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";

const STAFF: OrganizationRole[] = ["ADMIN", "AGENT"];

export async function requireSession(): Promise<OrganizationSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasOrganization(session)) {
    if (isPlatformSuperadminEmail(session.user.email)) {
      redirect("/admin");
    }
    redirect("/onboarding/planes");
  }
  return session;
}

export async function requireStaff(): Promise<OrganizationSession> {
  const session = await requireSession();
  if (!STAFF.includes(session.organizationRole)) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireModule(
  moduleKey: AppModuleKey,
): Promise<OrganizationSession> {
  const session = await requireSession();
  if (
    session.organizationRole !== "ADMIN" &&
    !hasModule(session.allowedModules, moduleKey)
  ) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireOrgAdmin(): Promise<OrganizationSession> {
  const session = await requireSession();
  if (
    session.organizationRole !== "ADMIN" &&
    !isPlatformSuperadminEmail(session.user.email)
  ) {
    redirect("/dashboard");
  }
  return session;
}

/** Alias para server actions que deben lanzar en vez de redirect. */
export async function requireOrgSessionOrThrow(): Promise<OrganizationSession> {
  return requireOrgSession();
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function isStaffRole(role: OrganizationRole | null | undefined): boolean {
  return role === "ADMIN" || role === "AGENT";
}
