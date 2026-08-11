import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  verifyLocalSession,
} from "@/features/auth/lib/session-crypto";

const ERP_PREFIXES = [
  "/dashboard",
  "/gestion",
  "/complejos",
  "/contratos",
  "/cobros",
  "/expensas",
  "/servicios",
  "/mantenimiento",
  "/rendiciones",
  "/usuarios",
  "/leads",
  "/visitas",
  "/agenda",
  "/ventas",
  "/ajustes",
  "/manual",
  "/turnero",
];

const PROTECTED_PREFIXES = [
  ...ERP_PREFIXES,
  "/admin",
  "/select-organization",
  "/onboarding",
];

const PUBLIC_EXACT = new Set(["/", "/login", "/sign-up"]);
const PUBLIC_PREFIXES = [
  "/propiedades",
  "/i",
  "/api/auth/login",
  "/api/billing",
  "/turnero/pantalla",
  "/api/turnero/pantalla",
];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isProtectedPath(pathname: string): boolean {
  return matchesPrefix(pathname, PROTECTED_PREFIXES);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname) || !isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyLocalSession(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Solo el superadmin de plataforma puede entrar a /admin.
  if (
    (pathname === "/admin" || pathname.startsWith("/admin/")) &&
    !session.platformSuperadmin
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Hub/tótem/operador requieren empresa en sesión.
  if (
    (pathname === "/turnero" ||
      pathname.startsWith("/turnero/totem") ||
      pathname.startsWith("/turnero/operador")) &&
    !session.organizationId
  ) {
    return NextResponse.redirect(new URL("/select-organization", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/gestion/:path*",
    "/complejos/:path*",
    "/contratos/:path*",
    "/cobros/:path*",
    "/expensas/:path*",
    "/servicios/:path*",
    "/mantenimiento/:path*",
    "/rendiciones/:path*",
    "/usuarios/:path*",
    "/leads/:path*",
    "/visitas",
    "/visitas/:path*",
    "/agenda",
    "/agenda/:path*",
    "/ventas",
    "/ventas/:path*",
    "/ajustes/:path*",
    "/manual",
    "/manual/:path*",
    "/turnero",
    "/turnero/:path*",
    "/admin",
    "/admin/:path*",
    "/select-organization/:path*",
    "/onboarding/:path*",
  ],
};
