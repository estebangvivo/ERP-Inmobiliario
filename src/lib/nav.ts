import type { OrganizationRole } from "@prisma/client";
import {
  BookOpen,
  Building2,
  CalendarDays,
  FileBarChart,
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

export const NAV_GROUP_ORDER = [
  "inmuebles",
  "administracion",
  "finanzas",
  "comercial",
  "atencion",
  "sistema",
] as const;

export type NavGroupId = (typeof NAV_GROUP_ORDER)[number];

export const NAV_GROUP_LABELS: Record<NavGroupId, string> = {
  inmuebles: "Inmuebles",
  administracion: "Administración",
  finanzas: "Finanzas",
  comercial: "Comercial",
  atencion: "Atención",
  sistema: "Sistema",
};

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  module: AppModuleKey;
  /** Roles que pueden ver este ítem (además del check de módulo). */
  roles: OrganizationRole[];
  /** Sin grupo: se muestra suelto (Dashboard). */
  group?: NavGroupId;
};

export type NavSection =
  | { kind: "item"; item: NavItem }
  | { kind: "group"; id: NavGroupId; title: string; items: NavItem[] };

export const erpNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    module: "home",
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT", "GUARANTOR", "SUPPLIER", "VIEWER"],
  },
  {
    title: "Propiedades",
    href: "/gestion/propiedades",
    icon: Home,
    module: "propiedades",
    group: "inmuebles",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Edificios",
    href: "/complejos",
    icon: Building2,
    module: "complejos",
    group: "inmuebles",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Contratos",
    href: "/contratos",
    icon: FileText,
    module: "contratos",
    group: "inmuebles",
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT", "GUARANTOR", "VIEWER"],
  },
  {
    title: "Expensas",
    href: "/expensas",
    icon: Receipt,
    module: "expensas",
    group: "administracion",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Rendiciones",
    href: "/rendiciones",
    icon: Wallet,
    module: "rendiciones",
    group: "administracion",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Servicios",
    href: "/servicios",
    icon: Building2,
    module: "servicios",
    group: "administracion",
    roles: ["ADMIN", "AGENT", "OWNER"],
  },
  {
    title: "Obras y Mantenimiento",
    href: "/mantenimiento",
    icon: Wrench,
    module: "mantenimiento",
    group: "administracion",
    roles: ["ADMIN", "AGENT", "SUPPLIER", "OWNER", "TENANT"],
  },
  {
    title: "Tesorería",
    href: "/tesoreria",
    icon: Landmark,
    module: "tesoreria",
    group: "finanzas",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Cuenta corriente",
    href: "/cobros/cuenta-corriente",
    icon: BookUser,
    module: "cobros",
    group: "finanzas",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Cobros",
    href: "/cobros",
    icon: Wallet,
    module: "cobros",
    group: "finanzas",
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT"],
  },
  {
    title: "Ventas",
    href: "/ventas",
    icon: Tag,
    module: "ventas",
    group: "comercial",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Visitas",
    href: "/visitas",
    icon: CalendarDays,
    module: "consultas",
    group: "comercial",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Agenda",
    href: "/agenda",
    icon: CalendarDays,
    module: "consultas",
    group: "comercial",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Consultas",
    href: "/leads",
    icon: MessageSquare,
    module: "consultas",
    group: "comercial",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "WhatsApp",
    href: "/whatsapp",
    icon: MessageCircle,
    module: "whatsapp",
    group: "atencion",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Turnero",
    href: "/turnero",
    icon: Ticket,
    module: "turnero",
    group: "atencion",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Reportes",
    href: "/reportes",
    icon: FileBarChart,
    module: "reportes",
    group: "sistema",
    roles: ["ADMIN", "AGENT"],
  },
  {
    title: "Usuarios",
    href: "/usuarios",
    icon: Users,
    module: "usuarios",
    group: "sistema",
    roles: ["ADMIN"],
  },
  {
    title: "Ajustes",
    href: "/ajustes",
    icon: Settings,
    module: "ajustes",
    group: "sistema",
    roles: ["ADMIN"],
  },
  {
    title: "Manual",
    href: "/manual",
    icon: BookOpen,
    module: "manual",
    group: "sistema",
    roles: ["ADMIN", "AGENT", "OWNER", "TENANT", "GUARANTOR", "SUPPLIER", "VIEWER"],
  },
];

export const adminNavItem: NavItem = {
  title: "Plataforma",
  href: "/admin",
  icon: Shield,
  module: "admin",
  group: "sistema",
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

/** Dashboard suelto y el resto en grupos, en el orden definido. Omite grupos vacíos. */
export function navSectionsForSession(
  role: OrganizationRole,
  modules: AppModuleKey[],
  options?: { includeAdmin?: boolean },
): NavSection[] {
  const items = navForSession(role, modules, options);
  const sections: NavSection[] = [];
  const grouped = new Map<NavGroupId, NavItem[]>();

  for (const item of items) {
    if (!item.group) {
      sections.push({ kind: "item", item });
      continue;
    }
    const list = grouped.get(item.group) ?? [];
    list.push(item);
    grouped.set(item.group, list);
  }

  for (const id of NAV_GROUP_ORDER) {
    const groupItems = grouped.get(id);
    if (!groupItems?.length) continue;
    sections.push({
      kind: "group",
      id,
      title: NAV_GROUP_LABELS[id],
      items: groupItems,
    });
  }

  return sections;
}

/** Evita que /cobros quede activo dentro de /cobros/cuenta-corriente. */
export function isNavItemActive(
  pathname: string,
  item: NavItem,
  items: NavItem[],
): boolean {
  if (pathname === item.href) return true;
  if (!pathname.startsWith(`${item.href}/`)) return false;
  return !items.some(
    (other) =>
      other.href !== item.href &&
      other.href.length > item.href.length &&
      (pathname === other.href || pathname.startsWith(`${other.href}/`)),
  );
}

export { SIDEBAR_MODULE_BY_HREF };
