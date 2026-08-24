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
import { DataTable, ListPagination, PageHeader } from "@/components/erp/page-chrome";
import {
  clampListPage,
  parseListPage,
  parseListPageSize,
  prismaSkipTake,
} from "@/lib/list-pagination";
import {
  DeleteServiceCostButton,
  GenerateFromCostsForm,
  ServiceCostForm,
} from "@/components/erp/service-cost-forms";

export default async function ExpensasPage({
  searchParams,
}: {
  searchParams: Promise<{
    costsPage?: string;
    expPage?: string;
    pageSize?: string;
  }>;
}) {
  const session = await requireModule("expensas");
  const staff = isStaffRole(session.organizationRole);
  const params = await searchParams;
  const pageSize = parseListPageSize(params.pageSize);
  const costsWhere = {
    organizationId: session.organizationId,
    ledger: "EXPENSES" as const,
  };
  const expWhere = { AND: [expenseScopeWhere(session), { ledger: "EXPENSES" as const }] };

  const [complexes, properties, costsTotal, expTotal] = await Promise.all([
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
    prisma.serviceCost.count({ where: costsWhere }),
    prisma.expense.count({ where: expWhere }),
  ]);

  const costsPageNum = clampListPage(
    parseListPage(params.costsPage),
    costsTotal,
    pageSize,
  );
  const expPageNum = clampListPage(parseListPage(params.expPage), expTotal, pageSize);

  const [serviceCosts, expenses] = await Promise.all([
    staff
      ? prisma.serviceCost.findMany({
          where: costsWhere,
          include: {
            complex: { select: { name: true } },
            property: { select: { title: true } },
          },
          orderBy: [
            { periodYear: "desc" },
            { periodMonth: "desc" },
            { createdAt: "desc" },
          ],
          ...prismaSkipTake(costsPageNum, pageSize),
        })
      : Promise.resolve([]),
    prisma.expense.findMany({
      where: expWhere,
      include: {
        complex: true,
        allocations: { include: { unit: true } },
      },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      ...prismaSkipTake(expPageNum, pageSize),
    }),
  ]);

  const listParams = {
    pageSize: pageSize !== 10 ? String(pageSize) : undefined,
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Expensas"
        description="Cargá todos los gastos del período (servicios, obras u otros) y generá las expensas una sola vez: se prorratean por m² de cada unidad sobre el total del edificio."
      />

      {staff ? (
        <section className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">Gastos del período</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Agua, gas, luz, tasa, obras o cualquier otro concepto. Aplicá a un
              edificio (se prorratea por m²) o a una propiedad (solo esa unidad).
            </p>
          </div>
          <ServiceCostForm
            complexes={complexes}
            properties={properties}
            ledger="EXPENSES"
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
            empty={costsTotal === 0}
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
                    variant={c.category === "WORKS" ? "warning" : "secondary"}
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
          <ListPagination
            page={costsPageNum}
            pageSize={pageSize}
            total={costsTotal}
            params={listParams}
            pageKey="costsPage"
          />

          <div className="pt-2">
            <h3 className="mb-2 text-base font-semibold">Generar expensas</h3>
            <GenerateFromCostsForm
              complexes={complexes}
              properties={properties}
              ledger="EXPENSES"
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Expensas del período</h3>
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
          empty={expTotal === 0}
        >
          {expenses.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 font-medium">
                {e.periodMonth}/{e.periodYear}
              </td>
              <td className="px-4 py-3">{e.complex.name}</td>
              <td className="px-4 py-3">
                <Badge variant={e.type === "ORDINARY" ? "secondary" : "warning"}>
                  {e.type === "ORDINARY" ? "Ordinaria" : "Extraordinaria"}
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
        <ListPagination
          page={expPageNum}
          pageSize={pageSize}
          total={expTotal}
          params={listParams}
          pageKey="expPage"
        />
      </section>
    </div>
  );
}
