import { SignJWT, jwtVerify } from "jose";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";

export const SESSION_COOKIE = "erp_session";

export type LocalSessionPayload = {
  userId: string;
  /** null = sin empresa (onboarding / panel plataforma). */
  organizationId: string | null;
  /** Claim de plataforma: solo true para el superadmin. */
  platformSuperadmin: boolean;
};

function secretKey() {
  const raw =
    process.env.AUTH_SECRET?.trim() || "erp-inmobiliario-dev-secret-change-me";
  return new TextEncoder().encode(raw);
}

export async function signLocalSession(input: {
  userId: string;
  organizationId: string | null;
  /** Email del usuario: define el claim platformSuperadmin. */
  email: string;
}): Promise<string> {
  const platformSuperadmin = isPlatformSuperadminEmail(input.email);
  return new SignJWT({
    userId: input.userId,
    organizationId: input.organizationId ?? "",
    platformSuperadmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secretKey());
}

export async function verifyLocalSession(
  token: string,
): Promise<LocalSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const userId = payload.userId;
    const organizationId = payload.organizationId;
    if (typeof userId !== "string") return null;
    if (typeof organizationId !== "string") return null;
    return {
      userId,
      organizationId: organizationId.length > 0 ? organizationId : null,
      platformSuperadmin: payload.platformSuperadmin === true,
    };
  } catch {
    return null;
  }
}
