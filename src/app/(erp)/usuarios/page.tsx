import { requireOrgAdmin } from "@/lib/session";
import { listOrganizationUsers } from "@/features/auth/actions/user-actions";
import {
  parseUserListPageSize,
  parseUserListRole,
  parseUserListStatus,
} from "@/features/auth/lib/user-list";
import { UsersAdminPanel } from "@/features/auth/components/users-admin-panel";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  role?: string;
  status?: string;
  page?: string;
  pageSize?: string;
  alta?: string;
}>;

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireOrgAdmin();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const role = parseUserListRole(params.role);
  const status = parseUserListStatus(params.status);
  const pageSize = parseUserListPageSize(params.pageSize);
  const requestedPage = Math.max(1, Number(params.page) || 1);
  const openAlta = params.alta === "1" || params.alta === "true";
  const defaultAltaRole = parseUserListRole(params.role);

  const { users, total, page } = await listOrganizationUsers(
    session.organizationId,
    { q, role, status, page: requestedPage, pageSize },
  );

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Miembros de la inmobiliaria, roles y módulos habilitados."
      />
      <UsersAdminPanel
        users={users}
        organizationId={session.organizationId}
        openAlta={openAlta}
        defaultAltaRole={defaultAltaRole}
        list={{
          q,
          role: role ?? "",
          status: status ?? "",
          page,
          pageSize,
          total,
        }}
      />
    </div>
  );
}
