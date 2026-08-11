"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { INDEX_PERIOD_OPTIONS } from "@/lib/index-periods";

export type IndexRateRow = {
  year: number;
  month: number;
  period: number;
  ipc?: string;
  icl?: string;
  cp?: string;
};

export function IndexRatesLoadedButton({ rows }: { rows: IndexRateRow[] }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [period, setPeriod] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (year && r.year !== Number(year)) return false;
      if (month && r.month !== Number(month)) return false;
      if (period && r.period !== Number(period)) return false;
      return true;
    });
  }, [rows, year, month, period]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={rows.length === 0}
      >
        Ver índices cargados
        {rows.length > 0 ? ` (${rows.length})` : ""}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="index-rates-loaded-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <h3
                  id="index-rates-loaded-title"
                  className="text-base font-semibold"
                >
                  Índices cargados
                </h3>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Filtrá por año, mes o período.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </Button>
            </div>

            <div className="grid gap-3 border-b border-[var(--border)] p-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="filterYear">Año</Label>
                <Input
                  id="filterYear"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="Todos"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filterMonth">Mes</Label>
                <Input
                  id="filterMonth"
                  type="number"
                  min={1}
                  max={12}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  placeholder="Todos"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filterPeriod">Período</Label>
                <Select
                  id="filterPeriod"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="">Todos</option>
                  {INDEX_PERIOD_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} meses
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="overflow-auto p-4">
              {filtered.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No hay índices con ese filtro.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="bg-[var(--muted)]/50 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Año/Mes</th>
                        <th className="px-3 py-2 font-medium">Período</th>
                        <th className="px-3 py-2 font-medium">IPC %</th>
                        <th className="px-3 py-2 font-medium">ICL %</th>
                        <th className="px-3 py-2 font-medium">CP %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => (
                        <tr
                          key={`${row.year}-${row.month}-${row.period}`}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-3 py-2 font-medium">
                            {row.month}/{row.year}
                          </td>
                          <td className="px-3 py-2">{row.period} meses</td>
                          <td className="px-3 py-2">{row.ipc ?? "—"}</td>
                          <td className="px-3 py-2">{row.icl ?? "—"}</td>
                          <td className="px-3 py-2">{row.cp ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
