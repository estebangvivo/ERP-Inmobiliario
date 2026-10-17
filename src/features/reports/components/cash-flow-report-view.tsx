import Link from "next/link";
import type { Currency } from "@prisma/client";
import { formatDateOnly } from "@/lib/dates";
import { BILL_STATUS_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type { CashFlowReport } from "@/features/reports/queries/cash-flow-report";
import { ReportKpi } from "@/features/reports/components/report-kpi";
import { formatMoneyByCurrency } from "@/config/currencies";

function money(amount: number, currency: string) {
  return formatMoney(String(amount), currency as Currency);
}

export function CashFlowReportView({ report }: { report: CashFlowReport }) {
  const pendingPayByCurrency: Record<string, number> = {};
  for (const [c, a] of Object.entries(report.pendingSettlementsByCurrency)) {
    pendingPayByCurrency[c] = (pendingPayByCurrency[c] ?? 0) + a;
  }
  for (const [c, a] of Object.entries(report.pendingInvoicesByCurrency)) {
    pendingPayByCurrency[c] = (pendingPayByCurrency[c] ?? 0) + a;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ReportKpi label="Ingresos del período" totals={report.incomeByCurrency} />
        <ReportKpi label="Egresos del período" totals={report.expenseByCurrency} />
        <ReportKpi label="Neto del período" totals={report.netByCurrency} />
        <ReportKpi
          label="Pendiente a cobrar"
          totals={report.pendingCollectByCurrency}
          hint="Cuotas abiertas de inquilinos"
        />
        <ReportKpi
          label="Pendiente a pagar"
          totals={pendingPayByCurrency}
          hint="Liquidaciones + facturas proveedor"
        />
      </div>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Movimientos del período</h3>
        {report.movements.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Sin movimientos de caja/banco en el rango.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Canal</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Cuenta</th>
                  <th className="px-3 py-2 font-medium">Descripción</th>
                  <th className="px-3 py-2 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {report.movements.slice(0, 200).map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDateOnly(m.occurredAt)}
                    </td>
                    <td className="px-3 py-2">
                      {m.channel === "CASH" ? "Caja" : "Banco"}
                    </td>
                    <td className="px-3 py-2">
                      {m.type === "INCOME" ? "Ingreso" : "Egreso"}
                    </td>
                    <td className="px-3 py-2">{m.accountLabel}</td>
                    <td className="px-3 py-2">{m.description}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {money(m.amount, m.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.movements.length > 200 ? (
              <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                Mostrando 200 de {report.movements.length} movimientos.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">Pendiente a cobrar</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Total {formatMoneyByCurrency(report.pendingCollectByCurrency)}
          </p>
        </div>
        {report.pendingCollect.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No hay cuotas abiertas.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Inquilino</th>
                  <th className="px-3 py-2 font-medium">Contrato / Propiedad</th>
                  <th className="px-3 py-2 font-medium">Cuota</th>
                  <th className="px-3 py-2 font-medium">Vence</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {report.pendingCollect.map((r) => (
                  <tr key={r.billId}>
                    <td className="px-3 py-2">{r.tenantName}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/cobros/${r.billId}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        {r.contractCode}
                      </Link>
                      <span className="text-[var(--muted-foreground)]">
                        {" "}
                        · {r.propertyTitle}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.installmentLabel}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDateOnly(r.dueDate)}
                    </td>
                    <td className="px-3 py-2">
                      {BILL_STATUS_LABELS[
                        r.status as keyof typeof BILL_STATUS_LABELS
                      ] ?? r.status}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {money(r.balance, r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">
            Pendiente a pagar — liquidaciones
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Total{" "}
            {formatMoneyByCurrency(report.pendingSettlementsByCurrency)}
          </p>
        </div>
        {report.pendingSettlements.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No hay liquidaciones emitidas pendientes.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Propietario</th>
                  <th className="px-3 py-2 font-medium">Período</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {report.pendingSettlements.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <Link
                        href="/rendiciones"
                        className="text-[var(--primary)] hover:underline"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.ownerName}</td>
                    <td className="px-3 py-2">{r.periodLabel}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {money(r.balance, r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">
            Pendiente a pagar — proveedores
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Total {formatMoneyByCurrency(report.pendingInvoicesByCurrency)}
          </p>
        </div>
        {report.pendingInvoices.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No hay facturas de proveedor sin pagar.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">OT</th>
                  <th className="px-3 py-2 font-medium">Factura</th>
                  <th className="px-3 py-2 font-medium">Proveedor</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {report.pendingInvoices.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.workOrderCode}</td>
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="px-3 py-2">{r.supplierName}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {money(r.balance, r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
