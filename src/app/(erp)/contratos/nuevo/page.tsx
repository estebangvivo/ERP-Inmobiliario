import { PageHeader } from "@/components/erp/page-chrome";
import { ContractCreateForm } from "@/components/erp/contract-form";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { propertyScopeWhere } from "@/lib/tenant-scope";

async function membersAsUsers(
  organizationId: string,
  roles: ("OWNER" | "TENANT" | "VIEWER" | "AGENT")[],
) {
  const rows = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: { in: roles },
      user: { isActive: true },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => r.user);
}

export default async function NuevoContratoPage() {
  const session = await requireStaff();
  const orgId = session.organizationId;

  const [properties, owners, tenants, guarantors] = await Promise.all([
    prisma.property.findMany({
      where: {
        AND: [
          propertyScopeWhere(session),
          { status: { in: ["AVAILABLE", "RESERVED", "RENTED"] } },
        ],
      },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    membersAsUsers(orgId, ["OWNER"]),
    membersAsUsers(orgId, ["TENANT"]),
    membersAsUsers(orgId, ["OWNER", "TENANT", "VIEWER", "AGENT"]),
  ]);

  return (
    <div>
      <PageHeader
        title="Nuevo contrato"
        description="Asocia propiedad, propietario, inquilino y condiciones."
      />
      <ContractCreateForm
        properties={properties}
        owners={owners}
        tenants={tenants}
        guarantors={guarantors}
      />
    </div>
  );
}
