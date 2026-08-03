import type { SessionContext } from "@/lib/auth";

const DEFAULT_SUPERADMIN_EMAILS = ["adminesteban@bunas.com.ar"];

function parseEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getPlatformSuperadminEmails(): string[] {
  const fromEnv = parseEmails(process.env.PLATFORM_SUPERADMIN_EMAILS);
  const merged = new Set([
    ...DEFAULT_SUPERADMIN_EMAILS.map((e) => e.toLowerCase()),
    ...fromEnv,
  ]);
  return [...merged];
}

export function isPlatformSuperadminEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return getPlatformSuperadminEmails().includes(email.trim().toLowerCase());
}

/** Filtro Prisma: excluye al superadmin de plataforma de listas de asignación. */
export function excludePlatformSuperadminFromUser() {
  const emails = getPlatformSuperadminEmails();
  if (emails.length === 0) return {};
  return { email: { notIn: emails } };
}

export function isPlatformSuperadmin(
  session: Pick<SessionContext, "user"> | { user: { email: string } },
): boolean {
  return isPlatformSuperadminEmail(session.user.email);
}

export function requirePlatformSuperadmin(
  session: Pick<SessionContext, "user"> | { user: { email: string } },
): void {
  if (!isPlatformSuperadmin(session)) {
    throw new Error("FORBIDDEN");
  }
}
