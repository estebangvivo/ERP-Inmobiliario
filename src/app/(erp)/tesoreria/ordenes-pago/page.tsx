import Link from "next/link";
import { requireModule } from "@/lib/session";
import { listPaymentOrders } from "@/features/treasury/queries/list-treasury";
import {
  formatMoney,
  TREASURY_STATUS_LABEL,
  TREASURY_STATUS_STYLE,
} from "@/features/treasury/lib/labels";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

export default async function OrdenesPagoPage() {
  await requireModule("tesoreria");
  const orders = await listPaymentOrders();

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

      {orders.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Todavía no hay órdenes de pago.
        </p>
      ) : (
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
      )}
    </div>
  );
}
