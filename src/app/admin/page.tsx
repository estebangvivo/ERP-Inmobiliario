import { listAdminOrganizationsOverview } from "@/features/auth/actions/admin-panel-actions";
import { AdminPanel } from "@/features/auth/components/admin-panel";
import { PageHeader } from "@/components/erp/page-chrome";

export default async function AdminPage() {
  const organizations = await listAdminOrganizationsOverview();

  return (
    <div>
      <PageHeader
        title="Administración de plataforma"
        description="Empresas, usuarios y facturación global."
      />
      <AdminPanel organizations={organizations} />
    </div>
  );
}
