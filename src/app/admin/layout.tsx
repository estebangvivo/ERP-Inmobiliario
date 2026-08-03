import { requireAdminPanelSession } from "@/lib/auth";
import { ErpShell } from "@/components/erp/shell";
import { BRAND_NAME } from "@/lib/brand";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminPanelSession();

  return (
    <ErpShell
      organizationRole={session.organizationRole ?? "ADMIN"}
      allowedModules={session.allowedModules}
      userName={session.user.name}
      organizationName={BRAND_NAME}
      organizationLogoSrc={null}
      showAdminNav
    >
      {children}
    </ErpShell>
  );
}
