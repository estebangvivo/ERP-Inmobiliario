import Link from "next/link";
import type { Currency } from "@prisma/client";
import { formatDateOnly } from "@/lib/dates";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { formatMoneyByCurrency } from "@/config/currencies";
import type { RecoverableExpensesReport } from "@/features/reports/queries/recoverable-expenses-report";
import { ReportKpi } from "@/features/reports/components/report-kpi";

export function RecoverableExpensesView({
  report,
}: {
  report: RecoverableExpensesReport;
}) {
  return (
    <div className="space-y-8">
      <p className="text-sm text-[var(--muted-foreground)]">
        Gastos con cargo &quot;Gastos a recuperar por la inmobiliaria&quot;. Si
        ya se pagó al proveedor, figuran como pendientes de recuperar del
        propietario (la imputación en rendición es un paso aparte).
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ReportKpi label="Total documentado" totals={report.totalByCurrency} />
        <ReportKpi label="Pagado a proveedor" totals={report.paidByCurrency} />
        <ReportKpi
          label="Pendiente de pagar"
          totals={report.pendingPaymentByCurrency}
        />
        <ReportKpi
          label="Pendiente de recuperar"
          totals={report.pendingRecoveryByCurrency}
          hint="Pagado al proveedor, aún no recuperado"
        />
      </div>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Facturas recuperables</h3>
        {report.invoices.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Sin facturas con este cargo en el rango.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">OT</th>
                  <th className="px-3 py-2 font-medium">Propiedad</th>
                  <th className="px-3 py-2 font-medium">Proveedor</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {report.invoices.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDateOnly(r.invoiceDate)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/mantenimiento/${r.workOrderId}`}
                        className="font-medium text-[var(--primary)] hover:underline"
                      >
                        {r.workOrderCode}
                      </Link>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {r.invoiceNumber ?? "Sin N°"} · {r.workOrderTitle}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {r.propertyTitle}
                      {r.contractCode ? (
                        <span className="text-[var(--muted-foreground)]">
                          {" "}
                          · {r.contractCode}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{r.supplierName}</td>
                    <td className="px-3 py-2">
                      {!r.paidToSupplier
                        ? "Pendiente de pagar"
                        : "Pagado · pendiente recuperar"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatMoney(String(r.amount), r.currency as Currency)}
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
            OT recuperables sin factura
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            {report.workOrdersWithoutInvoice.length} OT · total facturas{" "}
            {formatMoneyByCurrency(report.totalByCurrency)}
          </p>
        </div>
        {report.workOrdersWithoutInvoice.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No hay OT recuperables sin factura en el rango.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Título</th>
                  <th className="px-3 py-2 font-medium">Propiedad</th>
                  <th className="px-3 py-2 font-medium">Proveedor</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {report.workOrdersWithoutInvoice.map((wo) => (
                  <tr key={wo.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/mantenimiento/${wo.id}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        {wo.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{wo.title}</td>
                    <td className="px-3 py-2">
                      {wo.propertyTitle}
                      {wo.contractCode ? ` · ${wo.contractCode}` : ""}
                    </td>
                    <td className="px-3 py-2">{wo.assigneeName ?? "—"}</td>
                    <td className="px-3 py-2">
                      {WORK_ORDER_STATUS_LABELS[
                        wo.status as keyof typeof WORK_ORDER_STATUS_LABELS
                      ] ?? wo.status}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDateOnly(wo.requestedAt)}
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
