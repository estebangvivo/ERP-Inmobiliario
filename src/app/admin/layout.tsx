import { requireAdminPanelSession } from "@/lib/auth";
import { ErpShell } from "@/components/erp/shell";
import { BRAND_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

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
      userId={session.user.id}
      userName={session.user.name}
      organizationName={BRAND_NAME}
      organizationLogoSrc={null}
      showAdminNav
      enableMessageNotifications={false}
    >
      {children}
    </ErpShell>
  );
}
