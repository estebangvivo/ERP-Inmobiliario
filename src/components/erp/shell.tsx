"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { OrganizationRole } from "@prisma/client";
import { ErpHeader } from "@/components/erp/header";
import { ErpSidebar } from "@/components/erp/sidebar";
import { PresenceHeartbeat } from "@/features/auth/components/presence-heartbeat";
import type { AppModuleKey } from "@/features/auth/lib/modules";
import { cn } from "@/lib/utils";

type ErpShellProps = {
  organizationRole: OrganizationRole;
  allowedModules: AppModuleKey[];
  userName: string;
  organizationName: string;
  organizationLogoSrc?: string | null;
  showAdminNav?: boolean;
  children: React.ReactNode;
};

export function ErpShell({
  organizationRole,
  allowedModules,
  userName,
  organizationName,
  organizationLogoSrc,
  showAdminNav,
  children,
}: ErpShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      <PresenceHeartbeat />
      <button
        type="button"
        aria-label="Cerrar menú"
        className={cn(
          "fixed inset-0 z-30 bg-black/45 transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[min(18rem,88vw)] shrink-0 transition-transform duration-200 ease-out md:static md:z-auto md:w-64 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <ErpSidebar
          organizationRole={organizationRole}
          allowedModules={allowedModules}
          userName={userName}
          organizationName={organizationName}
          organizationLogoSrc={organizationLogoSrc}
          showAdminNav={showAdminNav}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <ErpHeader
          menuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen((v) => !v)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
