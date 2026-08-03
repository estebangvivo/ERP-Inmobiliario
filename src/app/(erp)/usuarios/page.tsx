import { requireOrgAdmin } from "@/lib/session";
import { listOrganizationUsers } from "@/features/auth/actions/user-actions";
import { UsersAdminPanel } from "@/features/auth/components/users-admin-panel";
import { PageHeader } from "@/components/erp/page-chrome";

export default async function UsuariosPage() {
  const session = await requireOrgAdmin();
  const users = await listOrganizationUsers(session.organizationId);

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Miembros de la inmobiliaria, roles y módulos habilitados."
      />
      <UsersAdminPanel
        users={users}
        organizationId={session.organizationId}
      />
    </div>
  );
}
