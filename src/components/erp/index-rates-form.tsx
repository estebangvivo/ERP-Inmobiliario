"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { IndexAdjustmentReportPanel } from "@/components/erp/index-adjustment-report";
import {
  getIndexAdjustmentReportAction,
  upsertIndexRatesAction,
  type IndexRatesActionResult,
} from "@/server/actions/index-rates";
import {
  INDEX_PERIOD_OPTIONS,
  indexRateKey,
} from "@/lib/index-periods";
import type { IndexAdjustmentReportRow } from "@/server/services/billing";

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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, startReportTransition] = useTransition();
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportRows, setReportRows] = useState<IndexAdjustmentReportRow[]>([]);
  const [reportPercent, setReportPercent] = useState<number | null>(null);
  const [reportEffectiveLabel, setReportEffectiveLabel] = useState<
    string | null
  >(null);
  const [reportLoadLabel, setReportLoadLabel] = useState<string | null>(null);
  const [reportPeriodMonths, setReportPeriodMonths] = useState<number | null>(
    null,
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

  useEffect(() => {
    if (state?.ok && (state.adjustments?.length ?? 0) > 0) {
      setReportRows(state.adjustments ?? []);
      setReportPercent(state.percent ?? null);
      setReportEffectiveLabel(state.effectiveLabel ?? null);
      setReportLoadLabel(
        `${String(periodMonth).padStart(2, "0")}/${periodYear}`,
      );
      setReportPeriodMonths(periodMonths);
    }
  }, [state, periodMonth, periodYear, periodMonths]);

  const liveAdjustments = state?.ok ? state.adjustments ?? [] : [];

  function openSavedReport() {
    setReportError(null);
    startReportTransition(async () => {
      const result = await getIndexAdjustmentReportAction({
        periodYear,
        periodMonth,
        periodMonths,
      });
      if (!result.ok) {
        setReportError(result.error);
        setReportOpen(true);
        return;
      }
      setReportRows(result.rows);
      setReportPercent(result.percent);
      setReportEffectiveLabel(result.effectiveLabel);
      setReportLoadLabel(result.loadLabel);
      setReportPeriodMonths(result.periodMonths);
      setReportOpen(true);
    });
  }

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

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={openSavedReport}
          disabled={reportLoading}
        >
          {reportLoading
            ? "Cargando reporte…"
            : "Ver reporte de ajustes de este período"}
        </Button>
      </div>

      {state?.ok && liveAdjustments.length > 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <IndexAdjustmentReportPanel
            percent={state.percent}
            effectiveLabel={state.effectiveLabel}
            loadLabel={`${String(periodMonth).padStart(2, "0")}/${periodYear}`}
            periodMonths={periodMonths}
            adjustments={liveAdjustments}
          />
        </div>
      ) : null}

      {reportOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="index-adjustment-report-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReportOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <h3
                  id="index-adjustment-report-title"
                  className="text-base font-semibold"
                >
                  Reporte de ajustes guardado
                </h3>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Contratos afectados por la carga seleccionada (sin reaplicar
                  índices).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReportOpen(false)}
              >
                Cerrar
              </Button>
            </div>
            <div className="overflow-auto p-4">
              {reportError ? (
                <p className="text-sm text-[var(--destructive)]">{reportError}</p>
              ) : (
                <IndexAdjustmentReportPanel
                  percent={reportPercent}
                  effectiveLabel={reportEffectiveLabel}
                  loadLabel={reportLoadLabel}
                  periodMonths={reportPeriodMonths}
                  adjustments={reportRows}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
