import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import {
  complexScopeWhere,
  expenseScopeWhere,
  propertyScopeWhere,
} from "@/lib/tenant-scope";
import { formatMoney } from "@/lib/money";
import { SERVICE_COST_CATEGORY_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader } from "@/components/erp/page-chrome";
import {
  DeleteServiceCostButton,
  GenerateFromCostsForm,
  ServiceCostForm,
} from "@/components/erp/service-cost-forms";

export default async function ServiciosPage() {
  const session = await requireModule("servicios");
  const staff = isStaffRole(session.organizationRole);

  const [complexes, properties, expenses, serviceCosts] = await Promise.all([
    prisma.complex.findMany({
      where: complexScopeWhere(session),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.property.findMany({
      where: propertyScopeWhere(session),
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.expense.findMany({
      where: { AND: [expenseScopeWhere(session), { ledger: "SERVICES" }] },
      include: {
        complex: true,
        allocations: { include: { unit: true } },
      },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    }),
    prisma.serviceCost.findMany({
      where: { organizationId: session.organizationId, ledger: "SERVICES" },
      include: {
        complex: { select: { name: true } },
        property: { select: { title: true } },
      },
      orderBy: [
        { periodYear: "desc" },
        { periodMonth: "desc" },
        { createdAt: "desc" },
      ],
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Servicios"
        description="Misma lógica que Expensas, con la categoría extra Gasto común. Se prorratean por m² sobre el total del edificio."
      />

      {staff ? (
        <section className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">Gastos del período</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Agua, gas, luz, tasa, obras, gasto común u otros. Aplicá a un
              edificio (se prorratea por m²) o a una propiedad (solo esa unidad).
            </p>
          </div>
          <ServiceCostForm
            complexes={complexes}
            properties={properties}
            ledger="SERVICES"
          />
          <DataTable
            headers={[
              "Período",
              "Alcance",
              "Categoría",
              "Concepto",
              "Monto",
              "",
            ]}
            empty={serviceCosts.length === 0}
          >
            {serviceCosts.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium">
                  {c.periodMonth}/{c.periodYear}
                </td>
                <td className="px-4 py-3 text-sm">
                  {c.complex
                    ? `Edificio · ${c.complex.name}`
                    : c.property
                      ? `Propiedad · ${c.property.title}`
                      : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      c.category === "WORKS"
                        ? "warning"
                        : c.category === "COMMON"
                          ? "success"
                          : "secondary"
                    }
                  >
                    {SERVICE_COST_CATEGORY_LABELS[c.category]}
                  </Badge>
                </td>
                <td className="px-4 py-3">{c.concept}</td>
                <td className="px-4 py-3">
                  {formatMoney(c.amount.toString(), c.currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteServiceCostButton id={c.id} />
                </td>
              </tr>
            ))}
          </DataTable>

          <div className="pt-2">
            <h3 className="mb-2 text-base font-semibold">Generar servicios</h3>
            <GenerateFromCostsForm
              complexes={complexes}
              properties={properties}
              ledger="SERVICES"
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Servicios del período</h3>
        <DataTable
          headers={[
            "Período",
            "Edificio",
            "Tipo",
            "Concepto",
            "Total",
            "Unidades",
            "Inquilino",
          ]}
          empty={expenses.length === 0}
        >
          {expenses.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 font-medium">
                {e.periodMonth}/{e.periodYear}
              </td>
              <td className="px-4 py-3">{e.complex.name}</td>
              <td className="px-4 py-3">
                <Badge variant={e.type === "ORDINARY" ? "secondary" : "warning"}>
                  {e.type === "ORDINARY" ? "Ordinario" : "Extraordinario"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <p>{e.concept}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {e.allocations
                    .map(
                      (a) =>
                        `${a.unit.code}: ${formatMoney(a.amount.toString(), e.currency)}`,
                    )
                    .join(" · ")}
                </p>
              </td>
              <td className="px-4 py-3">
                {formatMoney(e.totalAmount.toString(), e.currency)}
              </td>
              <td className="px-4 py-3">{e.allocations.length}</td>
              <td className="px-4 py-3">
                {e.billToTenant ? "Sí" : "No (owner)"}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
