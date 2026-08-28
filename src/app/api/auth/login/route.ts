import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/features/auth/lib/password";
import {
  SESSION_COOKIE,
  signLocalSession,
} from "@/features/auth/lib/session-crypto";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";

export const dynamic = "force-dynamic";

function cookieSecure() {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.FORCE_INSECURE_COOKIES !== "true"
  );
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
  };
}

function appUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  return new URL(path, base);
}

async function authenticate(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) {
    return { ok: false as const, error: "Completá email y contraseña." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return { ok: false as const, error: "Credenciales inválidas." };
  }
  if (!user.passwordHash) {
    return {
      ok: false as const,
      error: "Este usuario no tiene contraseña local.",
    };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { ok: false as const, error: "Credenciales inválidas." };
  }

  const isSuperadmin = isPlatformSuperadminEmail(user.email);

  // Superadmin: siempre entra sin empresa (panel /admin).
  // La empresa se elige después con "Entrar" desde Administración.
  if (isSuperadmin) {
    const token = await signLocalSession({
      userId: user.id,
      organizationId: null,
      email: user.email,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date(), lastSeenAt: new Date() },
    });
    return {
      ok: true as const,
      token,
      isPlatformSuperadmin: true,
      needsOrgPicker: false,
      needsOnboarding: false,
    };
  }

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  const token = await signLocalSession({
    userId: user.id,
    organizationId: memberships[0]?.organizationId ?? null,
    email: user.email,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastActivityAt: new Date(), lastSeenAt: new Date() },
  });

  return {
    ok: true as const,
    token,
    isPlatformSuperadmin: false,
    needsOrgPicker: memberships.length > 1,
    needsOnboarding: memberships.length === 0,
  };
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let email = "";
    let password = "";
    let wantsJson = contentType.includes("application/json");

    if (wantsJson) {
      const body = (await request.json()) as {
        email?: string;
        password?: string;
      };
      email = String(body.email ?? "");
      password = String(body.password ?? "");
    } else {
      const form = await request.formData();
      email = String(form.get("email") ?? "");
      password = String(form.get("password") ?? "");
      wantsJson = form.get("ajax") === "1";
    }

    const result = await authenticate(email, password);

    if (!result.ok) {
      if (wantsJson) {
        return NextResponse.json(
          { ok: false, error: result.error },
          { status: 401 },
        );
      }
      const url = appUrl("/login");
      url.searchParams.set("error", result.error);
      return NextResponse.redirect(url, 303);
    }

    const dest = result.isPlatformSuperadmin
      ? "/admin"
      : result.needsOnboarding
        ? "/onboarding/planes"
        : result.needsOrgPicker
          ? "/select-organization?required=1"
          : "/dashboard";

    if (wantsJson) {
      const res = NextResponse.json({
        ok: true,
        needsOrgPicker: result.needsOrgPicker,
        needsOnboarding: result.needsOnboarding,
        isPlatformSuperadmin: result.isPlatformSuperadmin,
        redirectTo: dest,
      });
      res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
      return res;
    }

    const res = NextResponse.redirect(appUrl(dest), 303);
    res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
    return res;
  } catch (error) {
    console.error("POST /api/auth/login", error);
    if (request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json(
        { ok: false, error: "No se pudo iniciar sesión." },
        { status: 500 },
      );
    }
    const url = appUrl("/login");
    url.searchParams.set("error", "No se pudo iniciar sesión.");
    return NextResponse.redirect(url, 303);
  }
}
