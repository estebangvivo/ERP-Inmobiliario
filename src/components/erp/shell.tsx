import type { OrganizationRole } from "@prisma/client";
import { ErpHeader } from "@/components/erp/header";
import { ErpSidebar } from "@/components/erp/sidebar";
import type { AppModuleKey } from "@/features/auth/lib/modules";

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
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      <ErpSidebar
        organizationRole={organizationRole}
        allowedModules={allowedModules}
        userName={userName}
        organizationName={organizationName}
        organizationLogoSrc={organizationLogoSrc}
        showAdminNav={showAdminNav}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <ErpHeader />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
