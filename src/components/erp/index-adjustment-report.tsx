"use client";

import Link from "next/link";
import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import type { IndexAdjustmentReportRow } from "@/server/services/billing";

export function IndexAdjustmentReportPanel({
  title = "Reporte de contratos ajustados",
  percent,
  effectiveLabel,
  loadLabel,
  periodMonths,
  adjustments,
}: {
  title?: string;
  percent?: number | null;
  effectiveLabel?: string | null;
  loadLabel?: string | null;
  periodMonths?: number | null;
  adjustments: IndexAdjustmentReportRow[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-base font-semibold">{title}</h4>
        <p className="text-sm text-[var(--muted-foreground)]">
          {percent != null ? `Índice aplicado: ${percent}%` : "Sin % registrado"}
          {effectiveLabel ? ` · vigencia ${effectiveLabel}` : ""}
          {loadLabel ? ` · carga ${loadLabel}` : ""}
          {periodMonths != null ? ` · período ${periodMonths} meses` : ""}
          {" · "}
          {adjustments.length} contrato
          {adjustments.length === 1 ? "" : "s"}
        </p>
      </div>
      {adjustments.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No hay contratos ajustados para este período de carga.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-medium">Contrato</th>
                <th className="px-3 py-2 font-medium">Propiedad</th>
                <th className="px-3 py-2 font-medium text-right">Pagaba</th>
                <th className="px-3 py-2 font-medium text-right">
                  Nuevo alquiler
                </th>
                <th className="px-3 py-2 font-medium text-right">Diferencia</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {adjustments.map((row) => {
                const diff = row.newRent - row.previousRent;
                const currency = row.currency as Currency;
                return (
                  <tr key={row.contractId}>
                    <td className="px-3 py-2 font-medium">{row.contractCode}</td>
                    <td className="px-3 py-2">{row.propertyTitle}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(String(row.previousRent), currency)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoney(String(row.newRent), currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      +{formatMoney(String(diff), currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/contratos/${row.contractId}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
