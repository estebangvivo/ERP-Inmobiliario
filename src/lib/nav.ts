import type { OrganizationRole } from "@prisma/client";
import {
  BookOpen,
  Building2,
  CalendarDays,
  FileText,
  Home,
  Landmark,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Receipt,
  Settings,
  Shield,
  Tag,
  Ticket,
  Users,
  Wrench,
  Wallet,
  BookUser,
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
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT", "GUARANTOR", "SUPPLIER", "VIEWER"],
  },
  {
    title: "Tesorería",
    href: "/tesoreria",
    icon: Landmark,
    module: "tesoreria",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Cuenta corriente",
    href: "/cobros/cuenta-corriente",
    icon: BookUser,
    module: "cobros",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Propiedades",
    href: "/gestion/propiedades",
    icon: Home,
    module: "propiedades",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Edificios",
    href: "/complejos",
    icon: Building2,
    module: "complejos",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Expensas",
    href: "/expensas",
    icon: Receipt,
    module: "expensas",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Rendiciones",
    href: "/rendiciones",
    icon: Wallet,
    module: "rendiciones",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Contratos",
    href: "/contratos",
    icon: FileText,
    module: "contratos",
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT", "GUARANTOR", "VIEWER"],
  },
  {
    title: "Cobros",
    href: "/cobros",
    icon: Wallet,
    module: "cobros",
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT"],
  },
  {
    title: "Servicios",
    href: "/servicios",
    icon: Building2,
    module: "servicios",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Obras y Mantenimiento",
    href: "/mantenimiento",
    icon: Wrench,
    module: "mantenimiento",
    roles: ["ADMIN", "AGENT", "SUPPLIER", "OWNER", "TENANT"],
  },
  {
    title: "Ventas",
    href: "/ventas",
    icon: Tag,
    module: "ventas",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Visitas",
    href: "/visitas",
    icon: CalendarDays,
    module: "consultas",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Agenda",
    href: "/agenda",
    icon: CalendarDays,
    module: "consultas",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Consultas",
    href: "/leads",
    icon: MessageSquare,
    module: "consultas",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "WhatsApp",
    href: "/whatsapp",
    icon: MessageCircle,
    module: "whatsapp",
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
  {
    title: "Manual",
    href: "/manual",
    icon: BookOpen,
    module: "manual",
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT", "GUARANTOR", "SUPPLIER", "VIEWER"],
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
