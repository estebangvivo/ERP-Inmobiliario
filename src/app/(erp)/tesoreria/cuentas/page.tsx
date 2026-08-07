import Link from "next/link";
import { requireModule, isStaffRole } from "@/lib/session";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, FilterBar, PageHeader } from "@/components/erp/page-chrome";
import { listTenantsWithDebt } from "@/server/services/tenant-ledger";
import {
  listOwnerAccountSummaries,
  listSupplierAccountSummaries,
} from "@/features/treasury/queries/account-statements";
import { syncOverdueBills } from "@/server/services/billing";
import { redirect } from "next/navigation";

type SearchParams = Promise<{ q?: string }>;

export default async function TesoreriaCuentasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("tesoreria");
  if (!isStaffRole(session.organizationRole)) {
    redirect("/tesoreria");
  }

  await syncOverdueBills(session.organizationId);
  const { q } = await searchParams;
  const query = q?.trim().toLowerCase() ?? "";

  let tenants = await listTenantsWithDebt(session.organizationId);
  if (query) {
    tenants = tenants.filter(
      (r) =>
        r.tenantName.toLowerCase().includes(query) ||
        r.tenantEmail.toLowerCase().includes(query),
    );
  }

  const [suppliers, owners] = await Promise.all([
    listSupplierAccountSummaries(),
    listOwnerAccountSummaries(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cuentas corrientes"
        description="Inquilinos con deuda (mismo cobro que en Cobros) y saldos de proveedores/propietarios."
        actions={
          <Link href="/tesoreria">
            <Button variant="outline" size="sm">
              Tesorería
            </Button>
          </Link>
        }
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Inquilinos</h2>
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
          empty={tenants.length === 0}
        >
          {tenants.map((r) => (
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
                <Link href={`/tesoreria/cuentas/inquilinos/${r.tenantId}`}>
                  <Button size="sm" variant="outline">
                    Ver deuda
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <AccountSection
        title="Proveedores"
        empty="Sin saldos abiertos de proveedores."
        rows={suppliers}
        href={(id) => `/tesoreria/cuentas/proveedores/${id}`}
      />
      <AccountSection
        title="Propietarios"
        empty="Sin saldos abiertos de propietarios."
        rows={owners}
        href={(id) => `/tesoreria/cuentas/propietarios/${id}`}
      />
    </div>
  );
}

function AccountSection({
  title,
  empty,
  rows,
  href,
}: {
  title: string;
  empty: string;
  rows: { id: string; name: string; balance: number; currency: string }[];
  href: (id: string) => string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border-y">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={href(row.id)}
                className="flex items-center justify-between py-3 hover:bg-[var(--muted)]/40"
              >
                <span>{row.name}</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(String(row.balance), row.currency as "ARS" | "USD" | "EUR")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
