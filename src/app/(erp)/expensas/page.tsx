import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { complexScopeWhere, expenseScopeWhere } from "@/lib/tenant-scope";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader } from "@/components/erp/page-chrome";
import { ExpenseForm } from "@/components/erp/expense-form";

export default async function ExpensasPage() {
  const session = await requireModule("expensas");
  const staff = isStaffRole(session.organizationRole);

  const [complexes, expenses] = await Promise.all([
    prisma.complex.findMany({
      where: complexScopeWhere(session),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.expense.findMany({
      where: expenseScopeWhere(session),
      include: {
        complex: true,
        allocations: { include: { unit: true } },
      },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expensas"
        description="Cargá el monto total del mes por complejo. Se prorratea a cada unidad por coeficiente y, si el contrato lo indica, se suma a la cuota del inquilino al generar cobros."
      />

      {staff ? <ExpenseForm complexes={complexes} /> : null}

      <DataTable
        headers={["Período", "Complejo", "Tipo", "Concepto", "Total", "Unidades", "Inquilino"]}
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
                {e.type === "ORDINARY" ? "Ordinaria" : "Extraordinaria"}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <p>{e.concept}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {e.allocations
                  .map((a) => `${a.unit.code}: ${formatMoney(a.amount.toString(), e.currency)}`)
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
    </div>
  );
}
