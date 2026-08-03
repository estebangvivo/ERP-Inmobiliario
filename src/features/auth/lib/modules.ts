import type { OrganizationRole } from "@prisma/client";

export const APP_MODULE_KEYS = [
  "home",
  "propiedades",
  "complejos",
  "contratos",
  "cobros",
  "expensas",
  "mantenimiento",
  "rendiciones",
  "consultas",
  "turnero",
  "usuarios",
  "ajustes",
  "admin",
] as const;

export type AppModuleKey = (typeof APP_MODULE_KEYS)[number];

export type AppModuleDef = {
  key: AppModuleKey;
  label: string;
  pathPrefixes: string[];
};

export const APP_MODULES: AppModuleDef[] = [
  { key: "home", label: "Inicio", pathPrefixes: ["/dashboard"] },
  {
    key: "propiedades",
    label: "Propiedades",
    pathPrefixes: ["/gestion/propiedades"],
  },
  { key: "complejos", label: "Complejos", pathPrefixes: ["/complejos"] },
  { key: "contratos", label: "Contratos", pathPrefixes: ["/contratos"] },
  { key: "cobros", label: "Cobros", pathPrefixes: ["/cobros"] },
  { key: "expensas", label: "Expensas", pathPrefixes: ["/expensas"] },
  {
    key: "mantenimiento",
    label: "Mantenimiento",
    pathPrefixes: ["/mantenimiento"],
  },
  { key: "rendiciones", label: "Rendiciones", pathPrefixes: ["/rendiciones"] },
  { key: "consultas", label: "Consultas", pathPrefixes: ["/leads"] },
  { key: "turnero", label: "Turnero", pathPrefixes: ["/turnero"] },
  { key: "usuarios", label: "Usuarios", pathPrefixes: ["/usuarios"] },
  { key: "ajustes", label: "Ajustes", pathPrefixes: ["/ajustes"] },
  { key: "admin", label: "Administración", pathPrefixes: ["/admin"] },
];

export const ORG_MODULE_KEYS: AppModuleKey[] = APP_MODULE_KEYS.filter(
  (k) => k !== "admin",
);

export const ROLE_DEFAULT_MODULES: Record<OrganizationRole, AppModuleKey[]> = {
  ADMIN: [...ORG_MODULE_KEYS],
  AGENT: [
    "home",
    "propiedades",
    "complejos",
    "contratos",
    "cobros",
    "expensas",
    "mantenimiento",
    "rendiciones",
    "consultas",
    "turnero",
  ],
  OWNER: [
    "home",
    "propiedades",
    "contratos",
    "expensas",
    "mantenimiento",
    "rendiciones",
  ],
  TENANT: ["home", "contratos", "cobros", "mantenimiento"],
  SUPPLIER: ["home", "mantenimiento"],
  VIEWER: ["home", "contratos"],
};

export function resolveAllowedModules(
  role: OrganizationRole,
  stored: string[] | null | undefined,
): AppModuleKey[] {
  // Nunca incluir "admin": ese módulo es exclusivo del superadmin de plataforma.
  if (role === "ADMIN") return [...ORG_MODULE_KEYS];
  if (stored && stored.length > 0) {
    const set = new Set(stored.filter((k) => k !== "admin"));
    return ORG_MODULE_KEYS.filter((k) => set.has(k));
  }
  return [...ROLE_DEFAULT_MODULES[role]];
}

export function hasModule(
  modules: AppModuleKey[] | string[],
  key: AppModuleKey,
): boolean {
  return modules.includes(key);
}

export const SIDEBAR_MODULE_BY_HREF: Record<string, AppModuleKey> = {
  "/dashboard": "home",
  "/gestion/propiedades": "propiedades",
  "/complejos": "complejos",
  "/contratos": "contratos",
  "/cobros": "cobros",
  "/expensas": "expensas",
  "/mantenimiento": "mantenimiento",
  "/rendiciones": "rendiciones",
  "/leads": "consultas",
  "/turnero": "turnero",
  "/usuarios": "usuarios",
  "/ajustes": "ajustes",
  "/admin": "admin",
};

export function moduleForPathname(pathname: string): AppModuleKey | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/usuarios")) return "usuarios";
  if (pathname.startsWith("/gestion/propiedades")) return "propiedades";
  if (pathname.startsWith("/complejos")) return "complejos";
  if (pathname.startsWith("/contratos")) return "contratos";
  if (pathname.startsWith("/cobros")) return "cobros";
  if (pathname.startsWith("/expensas")) return "expensas";
  if (pathname.startsWith("/mantenimiento")) return "mantenimiento";
  if (pathname.startsWith("/rendiciones")) return "rendiciones";
  if (pathname.startsWith("/leads")) return "consultas";
  if (pathname.startsWith("/turnero")) return "turnero";
  if (pathname.startsWith("/ajustes")) return "ajustes";
  if (pathname.startsWith("/dashboard") || pathname === "/") return "home";
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/select-organization")
  ) {
    return null;
  }
  return "home";
}
