import Link from "next/link";
import { requireModule, isStaffRole } from "@/lib/session";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, FilterBar, PageHeader } from "@/components/erp/page-chrome";
import { listTenantsWithDebt } from "@/server/services/tenant-ledger";
import { syncOverdueBills } from "@/server/services/billing";
import { redirect } from "next/navigation";

type SearchParams = Promise<{ q?: string }>;

export default async function CuentaCorrientePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("cobros");
  if (!isStaffRole(session.organizationRole)) {
    redirect("/cobros");
  }

  await syncOverdueBills(session.organizationId);
  const { q } = await searchParams;
  const query = q?.trim().toLowerCase() ?? "";

  let rows = await listTenantsWithDebt(session.organizationId);
  if (query) {
    rows = rows.filter(
      (r) =>
        r.tenantName.toLowerCase().includes(query) ||
        r.tenantEmail.toLowerCase().includes(query),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuenta corriente"
        description="Inquilinos con cuotas pendientes, parciales o vencidas."
        actions={
          <div className="flex flex-wrap gap-2">
            <a href="/api/export/morosos">
              <Button variant="outline" size="sm">
                Exportar morosos
              </Button>
            </a>
            <Link href="/cobros">
              <Button variant="outline" size="sm">
                Ver cuotas
              </Button>
            </Link>
          </div>
        }
      />

      <FilterBar className="lg:grid-cols-3">
        <Input
          name="q"
          placeholder="Buscar inquilino o email"
          defaultValue={q ?? ""}
        />
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </FilterBar>

      <DataTable
        headers={[
          "Inquilino",
          "Email",
          "Cuotas abiertas",
          "Deuda",
          "Venc. más antiguo",
          "",
        ]}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <tr key={r.tenantId} className="hover:bg-[var(--muted)]/40">
            <td className="px-4 py-3 font-medium">{r.tenantName}</td>
            <td className="px-4 py-3 text-[var(--muted-foreground)]">
              {r.tenantEmail}
            </td>
            <td className="px-4 py-3">{r.openBills}</td>
            <td className="px-4 py-3 font-semibold">
              {Object.entries(r.balanceByCurrency)
                .map(([currency, amount]) =>
                  formatMoney(
                    String(amount),
                    currency as "ARS" | "USD" | "EUR",
                  ),
                )
                .join(" · ")}
            </td>
            <td className="px-4 py-3 text-sm">
              {r.oldestDueDate ? formatDateOnly(r.oldestDueDate) : "—"}
            </td>
            <td className="px-4 py-3 text-right">
              <Link href={`/cobros/cuenta-corriente/${r.tenantId}`}>
                <Button size="sm" variant="outline">
                  Ver deuda
                </Button>
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
