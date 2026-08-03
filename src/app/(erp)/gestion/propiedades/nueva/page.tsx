import { PageHeader } from "@/components/erp/page-chrome";
import { PropertyForm } from "@/components/erp/property-form";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { complexScopeWhere } from "@/lib/tenant-scope";

export default async function NuevaPropiedadPage() {
  const session = await requireStaff();

  const [owners, units] = await Promise.all([
    prisma.organizationMember.findMany({
      where: {
        organizationId: session.organizationId,
        role: "OWNER",
        user: { isActive: true },
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.unit.findMany({
      where: { complex: complexScopeWhere(session) },
      include: { complex: true, property: true },
      orderBy: [{ complex: { name: "asc" } }, { code: "asc" }],
    }),
  ]);

  return (
    <div>
      <PageHeader title="Nueva propiedad" description="Alta de inmueble en el portfolio." />
      <PropertyForm
        mode="create"
        owners={owners.map((o) => o.user)}
        units={units
          .filter((u) => !u.property)
          .map((u) => ({
            id: u.id,
            label: `${u.complex.name} · ${u.code}`,
          }))}
      />
    </div>
  );
}
