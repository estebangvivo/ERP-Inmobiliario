import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/features/auth/lib/session-crypto";

export const dynamic = "force-dynamic";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.FORCE_INSECURE_COOKIES !== "true",
    path: "/",
    maxAge: 0,
  };
}

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions());
  return res;
}
