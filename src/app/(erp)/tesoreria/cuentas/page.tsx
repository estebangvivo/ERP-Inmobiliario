import Link from "next/link";
import { requireModule, isStaffRole } from "@/lib/session";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, FilterBar, ListPagination, PageHeader } from "@/components/erp/page-chrome";
import { listTenantsWithDebt } from "@/server/services/tenant-ledger";
import {
  listOwnerAccountSummaries,
  listSupplierAccountSummaries,
} from "@/features/treasury/queries/account-statements";
import { syncOverdueBills } from "@/server/services/billing";
import { redirect } from "next/navigation";
import {
  clampListPage,
  paginateArray,
  parseListPage,
  parseListPageSize,
} from "@/lib/list-pagination";

type SearchParams = Promise<{
  q?: string;
  page?: string;
  suppliersPage?: string;
  ownersPage?: string;
  pageSize?: string;
}>;

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
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const pageSize = parseListPageSize(params.pageSize);
  const listParams = {
    q: params.q?.trim() || undefined,
    pageSize: pageSize !== 10 ? String(pageSize) : undefined,
  };

  const rows = await listTenantsWithDebt(session.organizationId);
  const filteredTenants = query
    ? rows.filter(
        (r) =>
          r.tenantName.toLowerCase().includes(query) ||
          r.tenantEmail.toLowerCase().includes(query),
      )
    : rows;
  const tenantPage = clampListPage(
    parseListPage(params.page),
    filteredTenants.length,
    pageSize,
  );
  const tenantSlice = paginateArray(filteredTenants, tenantPage, pageSize);

  const [suppliers, owners] = await Promise.all([
    listSupplierAccountSummaries(),
    listOwnerAccountSummaries(),
  ]);

  const suppliersPage = clampListPage(
    parseListPage(params.suppliersPage),
    suppliers.length,
    pageSize,
  );
  const ownersPage = clampListPage(
    parseListPage(params.ownersPage),
    owners.length,
    pageSize,
  );
  const supplierSlice = paginateArray(suppliers, suppliersPage, pageSize);
  const ownerSlice = paginateArray(owners, ownersPage, pageSize);

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
            defaultValue={params.q ?? ""}
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
          empty={tenantSlice.total === 0}
        >
          {tenantSlice.items.map((r) => (
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
        <ListPagination
          page={tenantPage}
          pageSize={pageSize}
          total={tenantSlice.total}
          params={listParams}
        />
      </section>

      <AccountSection
        title="Proveedores"
        empty="Sin saldos abiertos de proveedores."
        rows={supplierSlice.items}
        total={supplierSlice.total}
        page={suppliersPage}
        pageSize={pageSize}
        params={listParams}
        pageKey="suppliersPage"
        href={(id) => `/tesoreria/cuentas/proveedores/${id}`}
      />
      <AccountSection
        title="Propietarios"
        empty="Sin saldos abiertos de propietarios."
        rows={ownerSlice.items}
        total={ownerSlice.total}
        page={ownersPage}
        pageSize={pageSize}
        params={listParams}
        pageKey="ownersPage"
        href={(id) => `/tesoreria/cuentas/propietarios/${id}`}
      />
    </div>
  );
}

function AccountSection({
  title,
  empty,
  rows,
  total,
  page,
  pageSize,
  params,
  pageKey,
  href,
}: {
  title: string;
  empty: string;
  rows: { id: string; name: string; balance: number; currency: string }[];
  total: number;
  page: number;
  pageSize: number;
  params: Record<string, string | undefined>;
  pageKey: string;
  href: (id: string) => string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {total === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{empty}</p>
      ) : (
        <>
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
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={total}
            params={params}
            pageKey={pageKey}
          />
        </>
      )}
    </section>
  );
}
