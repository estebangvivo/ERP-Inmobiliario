import Link from "next/link";
import { requireModule } from "@/lib/session";
import { listPaymentOrders } from "@/features/treasury/queries/list-treasury";
import {
  formatMoney,
  TREASURY_STATUS_LABEL,
  TREASURY_STATUS_STYLE,
} from "@/features/treasury/lib/labels";
import { Button } from "@/components/ui/button";
import { ListPagination, PageHeader } from "@/components/erp/page-chrome";
import { parseListPage, parseListPageSize } from "@/lib/list-pagination";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
};

export default async function OrdenesPagoPage({ searchParams }: PageProps) {
  await requireModule("tesoreria");
  const params = await searchParams;
  const pageSize = parseListPageSize(params.pageSize);
  const { items: orders, total, page } = await listPaymentOrders({
    page: parseListPage(params.page),
    pageSize,
  });
  const listParams = {
    pageSize: pageSize !== 10 ? String(pageSize) : undefined,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Órdenes de pago"
        description="Pagos registrados en tesorería."
        actions={
          <Link href="/tesoreria/ordenes-pago/new">
            <Button size="sm">Nueva orden</Button>
          </Link>
        }
      />

      {total === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Todavía no hay órdenes de pago.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {orders.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/tesoreria/ordenes-pago/${item.id}`}
                  className="flex flex-col gap-2 py-4 hover:bg-[var(--muted)]/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {item.number}{" "}
                      <span
                        className={`ml-2 rounded px-1.5 py-0.5 text-xs ${TREASURY_STATUS_STYLE[item.status]}`}
                      >
                        {TREASURY_STATUS_LABEL[item.status]}
                      </span>
                    </p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {item.partyName}
                      {item.contractLabels.length
                        ? ` · ${item.contractLabels.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <p className="font-medium tabular-nums">
                    {formatMoney(item.totalAmount, item.currency)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={total}
            params={listParams}
          />
        </>
      )}
    </div>
  );
}
