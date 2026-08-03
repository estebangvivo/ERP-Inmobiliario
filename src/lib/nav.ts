import type { OrganizationRole } from "@prisma/client";
import {
  Building2,
  FileText,
  Home,
  Landmark,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  Settings,
  Shield,
  Ticket,
  Users,
  Wrench,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  hasModule,
  SIDEBAR_MODULE_BY_HREF,
  type AppModuleKey,
} from "@/features/auth/lib/modules";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  module: AppModuleKey;
  /** Roles que pueden ver este ítem (además del check de módulo). */
  roles: OrganizationRole[];
};

export const erpNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    module: "home",
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT", "SUPPLIER", "VIEWER"],
  },
  {
    title: "Propiedades",
    href: "/gestion/propiedades",
    icon: Home,
    module: "propiedades",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Complejos",
    href: "/complejos",
    icon: Building2,
    module: "complejos",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Contratos",
    href: "/contratos",
    icon: FileText,
    module: "contratos",
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT", "VIEWER"],
  },
  {
    title: "Cobros",
    href: "/cobros",
    icon: Wallet,
    module: "cobros",
    roles: ["ADMIN", "AGENT", "TENANT"],
  },
  {
    title: "Expensas",
    href: "/expensas",
    icon: Receipt,
    module: "expensas",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Mantenimiento",
    href: "/mantenimiento",
    icon: Wrench,
    module: "mantenimiento",
    roles: ["ADMIN", "AGENT", "SUPPLIER", "OWNER", "TENANT"],
  },
  {
    title: "Rendiciones",
    href: "/rendiciones",
    icon: Landmark,
    module: "rendiciones",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Consultas",
    href: "/leads",
    icon: MessageSquare,
    module: "consultas",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Turnero",
    href: "/turnero",
    icon: Ticket,
    module: "turnero",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Usuarios",
    href: "/usuarios",
    icon: Users,
    module: "usuarios",
    roles: ["ADMIN"],
  },
  {
    title: "Ajustes",
    href: "/ajustes",
    icon: Settings,
    module: "ajustes",
    roles: ["ADMIN"],
  },
];

export const adminNavItem: NavItem = {
  title: "Plataforma",
  href: "/admin",
  icon: Shield,
  module: "admin",
  roles: ["ADMIN"],
};

export function navForSession(
  role: OrganizationRole,
  modules: AppModuleKey[],
  options?: { includeAdmin?: boolean },
): NavItem[] {
  const items = erpNavItems.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (role === "ADMIN") return true;
    return hasModule(modules, item.module);
  });

  if (options?.includeAdmin) {
    return [...items, adminNavItem];
  }
  return items;
}

export { SIDEBAR_MODULE_BY_HREF };
