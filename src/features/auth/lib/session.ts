import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  signLocalSession,
  verifyLocalSession,
  type LocalSessionPayload,
} from "./session-crypto";

function cookieSecure(): boolean {
  if (process.env.FORCE_INSECURE_COOKIES === "true") return false;
  return process.env.NODE_ENV === "production";
}

export { SESSION_COOKIE, signLocalSession, verifyLocalSession };
export type { LocalSessionPayload };

export async function setLocalSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieSecure(),
  });
}

export async function clearLocalSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readLocalSessionFromCookies(): Promise<LocalSessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyLocalSession(token);
}
