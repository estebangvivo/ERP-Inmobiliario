"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OrganizationRole } from "@prisma/client";
import { X } from "lucide-react";
import { BRAND_MARK_SRC, BRAND_NAME } from "@/lib/brand";
import { ROLE_LABELS } from "@/lib/labels";
import { navForSession } from "@/lib/nav";
import type { AppModuleKey } from "@/features/auth/lib/modules";
import { OperadorSidebarWidget } from "@/features/turnero/components/operador-sidebar-widget";
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
  const items = navForSession(organizationRole, allowedModules, {
    includeAdmin: showAdminNav,
  });

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
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href + item.title}
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
              {item.title}
            </Link>
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
