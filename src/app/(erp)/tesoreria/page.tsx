import Link from "next/link";
import {
  Banknote,
  BookUser,
  FileInput,
  FileOutput,
  Landmark,
  ScrollText,
  Wallet,
} from "lucide-react";
import { requireModule } from "@/lib/session";
import {
  getTreasuryFlowTotals,
  listPaymentOrders,
  listReceipts,
} from "@/features/treasury/queries/list-treasury";
import {
  formatMoney,
  TREASURY_STATUS_LABEL,
  TREASURY_STATUS_STYLE,
} from "@/features/treasury/lib/labels";
import { formatMoneyByCurrency, sumByCurrency } from "@/config/currencies";
import { getCashOverview } from "@/features/treasury/queries/cash-queries";
import { listBankAccounts } from "@/features/treasury/queries/bank-queries";
import { formatCashMoney } from "@/features/treasury/lib/cash-labels";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

export default async function TesoreriaPage() {
  await requireModule("tesoreria");

  const [receipts, orders, cash, bankAccounts, flows] = await Promise.all([
    listReceipts(),
    listPaymentOrders(),
    getCashOverview("ARS"),
    listBankAccounts({ activeOnly: true }),
    getTreasuryFlowTotals(),
  ]);

  const bankTotals = sumByCurrency(
    bankAccounts.map((a) => ({ currency: a.currency, amount: a.balance })),
  );

  const incomeTotal = sumByCurrency(flows.income);
  const expenseTotal = sumByCurrency(flows.expense);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tesorería"
        description="Recibos (cobros), órdenes de pago, caja, bancos y cheques."
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="border-l-2 border-emerald-600 pl-3">
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">
            Ingresos
          </dt>
          <dd className="mt-1 text-xl font-semibold">
            {formatMoneyByCurrency(incomeTotal)}
          </dd>
          <dd className="mt-1 text-xs text-[var(--muted-foreground)]">
            Caja + bancos (recibos)
          </dd>
        </div>
        <div className="border-l-2 border-red-600 pl-3">
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">
            Egresos
          </dt>
          <dd className="mt-1 text-xl font-semibold">
            {formatMoneyByCurrency(expenseTotal)}
          </dd>
          <dd className="mt-1 text-xs text-[var(--muted-foreground)]">
            Caja + bancos (órdenes de pago)
          </dd>
        </div>
        <div className="border-l-2 border-[var(--primary)] pl-3">
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">
            Bancos
          </dt>
          <dd className="mt-1 text-xl font-semibold">
            {bankAccounts.length === 0
              ? "Sin cuentas"
              : formatMoneyByCurrency(bankTotals)}
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            href: "/tesoreria/caja",
            icon: Wallet,
            title: "Caja",
            desc: `Diaria ${formatCashMoney(cash.daily.balance, cash.daily.currency)} · Tesorería ${formatCashMoney(cash.treasury.balance, cash.treasury.currency)}`,
          },
          {
            href: "/tesoreria/bancos",
            icon: Landmark,
            title: "Bancos",
            desc: "Cuentas y depósitos",
          },
          {
            href: "/tesoreria/cheques",
            icon: ScrollText,
            title: "Cheques",
            desc: "Cartera y propios",
          },
          {
            href: "/tesoreria/cuentas",
            icon: BookUser,
            title: "Cuentas corrientes",
            desc: "Inquilinos, proveedores y propietarios",
          },
          {
            href: "/tesoreria/recibos/new",
            icon: FileInput,
            title: "Nuevo recibo",
            desc: "Cobros de cuotas y otros ingresos",
          },
          {
            href: "/tesoreria/ordenes-pago/new",
            icon: FileOutput,
            title: "Nueva orden de pago",
            desc: "Pagos a proveedores y rendiciones",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-4 hover:bg-[var(--muted)]/40"
          >
            <item.icon className="size-5 text-[var(--primary)]" />
            <span>
              <span className="block font-medium">{item.title}</span>
              <span className="text-sm text-[var(--muted-foreground)]">
                {item.desc}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recibos</h2>
            <Link
              href="/tesoreria/recibos"
              className="text-sm text-[var(--primary)]"
            >
              Ver todos
            </Link>
          </div>
          <DocList
            items={receipts.slice(0, 8)}
            href={(id) => `/tesoreria/recibos/${id}`}
            empty="Todavía no hay recibos. Los cobros de cuotas generan recibos automáticamente."
          />
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Órdenes de pago</h2>
            <Link
              href="/tesoreria/ordenes-pago"
              className="text-sm text-[var(--primary)]"
            >
              Ver todas
            </Link>
          </div>
          <DocList
            items={orders.slice(0, 8)}
            href={(id) => `/tesoreria/ordenes-pago/${id}`}
            empty="Todavía no hay órdenes de pago."
          />
        </section>
      </div>

      <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <Banknote className="size-3.5" />
        Configurá cuentas bancarias en Ajustes.
      </p>
    </div>
  );
}

function DocList({
  items,
  href,
  empty = "Sin documentos aún.",
}: {
  items: Awaited<ReturnType<typeof listReceipts>>;
  href: (id: string) => string;
  empty?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
        {empty}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={href(item.id)}
            className="flex flex-col gap-1 py-3 hover:bg-[var(--muted)]/40 sm:flex-row sm:items-center sm:justify-between"
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
                {item.partyName} · {item.paymentMethodsLabel}
              </p>
            </div>
            <p className="text-sm font-medium tabular-nums">
              {formatMoney(item.totalAmount, item.currency)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
