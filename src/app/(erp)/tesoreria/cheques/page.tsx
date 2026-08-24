import Link from "next/link";
import { requireModule } from "@/lib/session";
import { listChecks } from "@/features/treasury/queries/list-checks";
import { formatMoney, CHECK_STATUS_LABEL } from "@/features/treasury/lib/labels";
import { formatDateAR } from "@/lib/format-date";
import { ListPagination, PageHeader } from "@/components/erp/page-chrome";
import { parseListPage, parseListPageSize } from "@/lib/list-pagination";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
};

export default async function ChequesPage({ searchParams }: PageProps) {
  await requireModule("tesoreria");
  const params = await searchParams;
  const pageSize = parseListPageSize(params.pageSize);
  const { items: checks, total, page } = await listChecks({
    status: "ALL",
    kind: "ALL",
    page: parseListPage(params.page),
    pageSize,
  });
  const listParams = {
    pageSize: pageSize !== 10 ? String(pageSize) : undefined,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Cheques" description="Cartera, entregados y rechazados." />
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--muted)]/60 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Número</th>
              <th className="px-4 py-3 font-medium">Banco</th>
              <th className="px-4 py-3 font-medium">Vencimiento</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {checks.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-[var(--muted-foreground)]"
                >
                  No hay cheques para mostrar.
                </td>
              </tr>
            ) : (
              checks.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--muted)]/40">
                  <td className="px-4 py-3">{c.number}</td>
                  <td className="px-4 py-3">{c.bank}</td>
                  <td className="px-4 py-3">
                    {c.dueDate ? formatDateAR(c.dueDate) : "—"}
                  </td>
                  <td className="px-4 py-3">{CHECK_STATUS_LABEL[c.status]}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(c.amount, c.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ListPagination
        page={page}
        pageSize={pageSize}
        total={total}
        params={listParams}
      />
      <Link href="/tesoreria" className="text-sm text-[var(--primary)]">
        ← Tesorería
      </Link>
    </div>
  );
}
