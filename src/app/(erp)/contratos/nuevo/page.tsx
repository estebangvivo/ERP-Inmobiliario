import { PageHeader } from "@/components/erp/page-chrome";
import { ContractCreateForm } from "@/components/erp/contract-form";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { propertyScopeWhere } from "@/lib/tenant-scope";
import { listOrgPeople } from "@/server/queries/org-people";

export default async function NuevoContratoPage() {
  const session = await requireStaff();
  const orgId = session.organizationId;

  const [properties, owners, tenants, guarantors] = await Promise.all([
    prisma.property.findMany({
      where: {
        AND: [
          propertyScopeWhere(session),
          { operationType: "RENT" },
          { status: { in: ["AVAILABLE", "RESERVED"] } },
        ],
      },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        price: true,
        currency: true,
        ownerships: {
          orderBy: [{ isPrimary: "desc" }, { sharePct: "desc" }],
          take: 1,
          include: { owner: { select: { id: true, name: true } } },
        },
      },
    }),
    listOrgPeople(orgId, ["OWNER"]),
    listOrgPeople(orgId, ["TENANT"]),
    listOrgPeople(orgId, ["GUARANTOR", "OWNER", "TENANT", "VIEWER", "AGENT"]),
  ]);

  return (
    <div>
      <PageHeader
        title="Nuevo contrato"
        description="Asocia propiedad, propietario, inquilino y condiciones."
      />
      <ContractCreateForm
        properties={properties.map((p) => {
          const primary = p.ownerships[0];
          return {
            id: p.id,
            title: p.title,
            price: p.price?.toString() ?? null,
            currency: p.currency,
            ownerId: primary?.owner.id ?? null,
            ownerName: primary?.owner.name ?? null,
          };
        })}
        owners={owners}
        tenants={tenants}
        guarantors={guarantors}
      />
    </div>
  );
}
