import Link from "next/link";
import type { Currency } from "@prisma/client";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatMoneyByCurrency } from "@/config/currencies";
import type { DelinquencyReport } from "@/features/reports/queries/delinquency-report";
import { ReportKpi } from "@/features/reports/components/report-kpi";

function money(amount: number, currency: string) {
  return formatMoney(String(amount), currency as Currency);
}

function agingLabel(bucket: string) {
  switch (bucket) {
    case "b0_30":
      return "0–30 días";
    case "b31_60":
      return "31–60 días";
    case "b61_90":
      return "61–90 días";
    case "b90_plus":
      return "+90 días";
    default:
      return bucket;
  }
}

export function DelinquencyReportView({
  report,
}: {
  report: DelinquencyReport;
}) {
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ReportKpi label="Saldo total moroso" totals={report.totalByCurrency} />
        {(
          ["b0_30", "b31_60", "b61_90", "b90_plus"] as const
        ).map((key) => (
          <ReportKpi
            key={key}
            label={agingLabel(key)}
            totals={{ ARS: report.agingTotals[key] }}
            hint="Aging principal (ARS aprox. / moneda del CC)"
          />
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">Inquilinos con deuda</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            {report.rows.length} inquilinos ·{" "}
            {formatMoneyByCurrency(report.totalByCurrency)}
          </p>
        </div>
        {report.rows.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No hay deuda abierta.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Inquilino</th>
                  <th className="px-3 py-2 font-medium text-right">Cuotas</th>
                  <th className="px-3 py-2 font-medium text-right">Saldo</th>
                  <th className="px-3 py-2 font-medium text-right">0–30</th>
                  <th className="px-3 py-2 font-medium text-right">31–60</th>
                  <th className="px-3 py-2 font-medium text-right">61–90</th>
                  <th className="px-3 py-2 font-medium text-right">+90</th>
                  <th className="px-3 py-2 font-medium">Vence más antigua</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {report.rows.map((r) => (
                  <tr key={r.tenantId}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/cobros/cuenta-corriente/${r.tenantId}`}
                        className="font-medium text-[var(--primary)] hover:underline"
                      >
                        {r.tenantName}
                      </Link>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {r.tenantEmail}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">{r.openBills}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatMoneyByCurrency(r.balanceByCurrency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {money(r.aging.b0_30, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {money(r.aging.b31_60, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {money(r.aging.b61_90, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {money(r.aging.b90_plus, r.currency)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.oldestDueDate ? formatDateOnly(r.oldestDueDate) : "—"}
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
