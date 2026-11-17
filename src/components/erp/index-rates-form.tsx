"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  upsertIndexRatesAction,
  type IndexRatesActionResult,
} from "@/server/actions/index-rates";
import {
  INDEX_PERIOD_OPTIONS,
  indexRateKey,
} from "@/lib/index-periods";
import { formatMoney } from "@/lib/money";

const initial: IndexRatesActionResult | null = null;

export type IndexRatePreset = { ipc?: string; icl?: string; cp?: string };

export function IndexRatesForm({
  defaults,
  savedRates,
}: {
  defaults?: {
    periodYear: number;
    periodMonth: number;
    periodMonths: number;
    ipc?: string;
    icl?: string;
    cp?: string;
  };
  /** Clave `${year}-${month}-${periodMonths}` → porcentajes. */
  savedRates?: Record<string, IndexRatePreset>;
}) {
  const router = useRouter();
  const now = new Date();
  const [periodYear, setPeriodYear] = useState(
    defaults?.periodYear ?? now.getFullYear(),
  );
  const [periodMonth, setPeriodMonth] = useState(
    defaults?.periodMonth ?? now.getMonth() + 1,
  );
  const [periodMonths, setPeriodMonths] = useState(
    defaults?.periodMonths ?? 6,
  );
  const [state, formAction, pending] = useActionState(
    upsertIndexRatesAction,
    initial,
  );

  const key = useMemo(
    () => indexRateKey(periodYear, periodMonth, periodMonths),
    [periodYear, periodMonth, periodMonths],
  );
  const preset = savedRates?.[key];
  const ipcDefault = preset?.ipc ?? "";
  const iclDefault = preset?.icl ?? "";
  const cpDefault = preset?.cp ?? "";

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const adjustments = state?.ok ? state.adjustments ?? [] : [];

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-7"
      >
        <div className="space-y-1">
          <Label htmlFor="idxYear">Año</Label>
          <Input
            id="idxYear"
            name="periodYear"
            type="number"
            value={periodYear}
            onChange={(e) => setPeriodYear(Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="idxMonth">Mes</Label>
          <Input
            id="idxMonth"
            name="periodMonth"
            type="number"
            min={1}
            max={12}
            value={periodMonth}
            onChange={(e) => setPeriodMonth(Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="periodMonths">Período</Label>
          <Select
            id="periodMonths"
            name="periodMonths"
            value={String(periodMonths)}
            onChange={(e) => setPeriodMonths(Number(e.target.value))}
            required
          >
            {INDEX_PERIOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} meses
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="percent_IPC">IPC %</Label>
          <Input
            key={`ipc-${key}-${ipcDefault}`}
            id="percent_IPC"
            name="percent_IPC"
            type="number"
            step="0.0001"
            defaultValue={ipcDefault}
            placeholder="Acumulado"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="percent_ICL">ICL %</Label>
          <Input
            key={`icl-${key}-${iclDefault}`}
            id="percent_ICL"
            name="percent_ICL"
            type="number"
            step="0.0001"
            defaultValue={iclDefault}
            placeholder="Acumulado"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="percent_CP">CP %</Label>
          <Input
            key={`cp-${key}-${cpDefault}`}
            id="percent_CP"
            name="percent_CP"
            type="number"
            step="0.0001"
            defaultValue={cpDefault}
            placeholder="Acumulado"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Aplicando…" : "Aplicar los índices"}
          </Button>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] sm:col-span-full">
          Un registro por año, mes y período. El % es el acumulado del tramo. Al
          guardar, se toma el mayor entre IPC/ICL/CP y se aplica
          automáticamente a los contratos activos de ese período cuya próxima
          actualización sea el mes siguiente (ej. carga en junio → aumenta en
          julio si el contrato ajusta cada 6 meses desde enero). Las cuotas
          abiertas desde esa vigencia se recalculan.
        </p>
        {state && !state.ok ? (
          <p className="text-sm text-[var(--destructive)] sm:col-span-full">
            {state.error}
          </p>
        ) : null}
        {state?.ok && state.message ? (
          <p className="text-sm text-emerald-700 sm:col-span-full">
            {state.message}
          </p>
        ) : null}
      </form>

      {state?.ok && adjustments.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div>
            <h4 className="text-base font-semibold">
              Reporte de contratos ajustados
            </h4>
            <p className="text-sm text-[var(--muted-foreground)]">
              Índice aplicado: {state.percent}%
              {state.effectiveLabel
                ? ` · vigencia ${state.effectiveLabel}`
                : ""}
              {" · "}
              {adjustments.length} contrato
              {adjustments.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/40 text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Contrato</th>
                  <th className="px-3 py-2 font-medium">Propiedad</th>
                  <th className="px-3 py-2 font-medium text-right">
                    Pagaba
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    Nuevo alquiler
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    Diferencia
                  </th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {adjustments.map((row) => {
                  const diff = row.newRent - row.previousRent;
                  const currency = row.currency as Currency;
                  return (
                    <tr key={row.contractId}>
                      <td className="px-3 py-2 font-medium">
                        {row.contractCode}
                      </td>
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
        </div>
      ) : null}
    </div>
  );
}
