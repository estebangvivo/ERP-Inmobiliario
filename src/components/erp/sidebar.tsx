"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OrganizationRole } from "@prisma/client";
import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { BRAND_MARK_SRC, BRAND_NAME } from "@/lib/brand";
import { ROLE_LABELS } from "@/lib/labels";
import {
  isNavItemActive,
  navSectionsForSession,
  type NavGroupId,
  type NavItem,
} from "@/lib/nav";
import type { AppModuleKey } from "@/features/auth/lib/modules";
import { OperadorSidebarWidget } from "@/features/turnero/components/operador-sidebar-widget";
import { useStaffNotifications } from "@/features/whatsapp/components/staff-message-notifications";
import { cn } from "@/lib/utils";

type ErpSidebarProps = {
  organizationRole: OrganizationRole;
  allowedModules: AppModuleKey[];
  userName: string;
  organizationName: string;
  /** Logo de la inmobiliaria (API/data URL). Si no hay, se usa el de SimpleInmo. */
  organizationLogoSrc?: string | null;
  showAdminNav?: boolean;
  onNavigate?: () => void;
};

export function ErpSidebar({
  organizationRole,
  allowedModules,
  userName,
  organizationName,
  organizationLogoSrc,
  showAdminNav,
  onNavigate,
}: ErpSidebarProps) {
  const pathname = usePathname();
  const notifications = useStaffNotifications();
  const sections = navSectionsForSession(organizationRole, allowedModules, {
    includeAdmin: showAdminNav,
  });
  const items = sections.flatMap((section) =>
    section.kind === "item" ? [section.item] : section.items,
  );
  const activeGroupId = sections.find(
    (section): section is Extract<(typeof sections)[number], { kind: "group" }> =>
      section.kind === "group" &&
      section.items.some((item) => isNavItemActive(pathname, item, items)),
  )?.id;
  const [collapsed, setCollapsed] = useState<Partial<Record<NavGroupId, boolean>>>(
    {},
  );

  useEffect(() => {
    if (!activeGroupId) return;
    setCollapsed((current) => {
      if (!current[activeGroupId]) return current;
      const next = { ...current };
      delete next[activeGroupId];
      return next;
    });
  }, [activeGroupId]);

  const hasOrgLogo = Boolean(organizationLogoSrc);
  // Siempre isotipo SimpleInmo (sin texto). Si la empresa tiene logo, se usa ese.
  const logoSrc = organizationLogoSrc || BRAND_MARK_SRC;

  return (
    <aside className="flex h-full w-full flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-start gap-2">
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Image
              src={logoSrc}
              alt={hasOrgLogo ? organizationName : BRAND_NAME}
              width={96}
              height={96}
              className={cn(
                "h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14",
                !hasOrgLogo && "brightness-0 invert",
              )}
              priority
              unoptimized
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold leading-tight tracking-tight text-white">
                {organizationName}
              </p>
              <p className="mt-0.5 truncate text-xs text-white/55">
                {ROLE_LABELS[organizationRole]}
              </p>
            </div>
          </Link>
          <button
            type="button"
            aria-label="Cerrar menú"
            className="mt-1 rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white md:hidden"
            onClick={onNavigate}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <nav className="sidebar-scroll flex-1 space-y-1 overflow-y-auto p-3">
        {sections.map((section) => {
          if (section.kind === "item") {
            return (
              <NavLink
                key={section.item.href}
                item={section.item}
                items={items}
                pathname={pathname}
                onNavigate={onNavigate}
                unread={
                  section.item.href === "/whatsapp"
                    ? notifications?.deskUnread
                    : undefined
                }
              />
            );
          }

          const open =
            section.id === activeGroupId
              ? collapsed[section.id] !== true
              : collapsed[section.id] === false;
          const groupUnread = section.items.some((item) => item.href === "/whatsapp")
            ? notifications?.deskUnread
            : 0;

          return (
            <div
              key={section.id}
              className={cn("pt-2", section.id === "sistema" && "mt-2 border-t border-white/10 pt-3")}
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [section.id]: open,
                  }))
                }
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40 hover:text-white/70"
              >
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
                {!open && groupUnread ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-semibold text-emerald-950">
                    {groupUnread > 9 ? "9+" : groupUnread}
                  </span>
                ) : null}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
              {open ? (
                <div className="mt-0.5 space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.href + item.title}
                      item={item}
                      items={items}
                      pathname={pathname}
                      onNavigate={onNavigate}
                      unread={
                        item.href === "/whatsapp"
                          ? notifications?.deskUnread
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="px-3 pb-2">
        <OperadorSidebarWidget />
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <p className="truncate text-sm font-medium text-white">{userName}</p>
        <p className="text-xs text-white/50">Sesión activa</p>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  items,
  pathname,
  onNavigate,
  unread,
}: {
  item: NavItem;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  unread?: number;
}) {
  const active = isNavItemActive(pathname, item, items);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
        active
          ? "bg-[var(--sidebar-active)] font-medium text-white"
          : "text-white/65 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {unread && unread > 0 ? (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1.5 text-[10px] font-semibold text-emerald-950">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
