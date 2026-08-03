"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AR_INAMOVIBLES } from "@/lib/ar-holidays";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  updateVisitScheduleAction,
  type VisitScheduleSettingsPayload,
} from "@/server/actions/visit-bookings";

const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

const HOUR_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 7); // 7–21

function formatClosedLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 15)));
}

export function VisitScheduleSettings({
  initial,
}: {
  initial: VisitScheduleSettingsPayload;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [weekdays, setWeekdays] = useState(initial.schedule.weekdays);
  const [hourStart, setHourStart] = useState(initial.schedule.hourStart);
  const [hourEnd, setHourEnd] = useState(initial.schedule.hourEnd);
  const [closedDates, setClosedDates] = useState(initial.schedule.closedDates);
  const [enabledHolidays, setEnabledHolidays] = useState(
    initial.enabledHolidayMonthDays,
  );
  const [extraDate, setExtraDate] = useState("");

  const uniqueHolidayRows = useMemo(() => {
    return AR_INAMOVIBLES.map((h) => ({
      monthDay: h.monthDay,
      name: h.name,
      dates: initial.holidays
        .filter((x) => x.monthDay === h.monthDay)
        .map((x) => x.dateKey),
    }));
  }, [initial.holidays]);

  function toggleWeekday(day: number) {
    setWeekdays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  }

  function toggleHoliday(monthDay: string) {
    setEnabledHolidays((prev) =>
      prev.includes(monthDay)
        ? prev.filter((d) => d !== monthDay)
        : [...prev, monthDay].sort(),
    );
  }

  function addClosedDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(extraDate)) return;
    setClosedDates((prev) =>
      prev.includes(extraDate) ? prev : [...prev, extraDate].sort(),
    );
    setExtraDate("");
  }

  function save() {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await updateVisitScheduleAction({
        weekdays,
        hourStart,
        hourEnd,
        closedDates,
        enabledHolidays,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(result.message ?? "Agenda guardada.");
      router.refresh();
    });
  }

  if (!initial.canEdit) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
        Agenda de visitas: <span className="text-[var(--foreground)]">{initial.summary}</span>
        . Los feriados inamovibles y cierres los configura un administrador.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-sm font-medium">Horarios y feriados</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {initial.summary}
          </p>
        </div>
        <span className="text-xs text-[var(--muted-foreground)]">
          {open ? "Ocultar" : "Configurar"}
        </span>
      </button>

      {open ? (
        <div className="space-y-5 border-t border-[var(--border)] px-4 py-4">
          <div className="space-y-2">
            <Label>Días de atención</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = weekdays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleWeekday(d.value)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      on
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-[var(--border)] bg-[var(--background)]"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="visit-hour-start">Desde</Label>
              <Select
                id="visit-hour-start"
                value={String(hourStart)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setHourStart(next);
                  if (hourEnd <= next) setHourEnd(next + 1);
                }}
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="visit-hour-end">Hasta</Label>
              <Select
                id="visit-hour-end"
                value={String(hourEnd)}
                onChange={(e) => setHourEnd(Number(e.target.value))}
              >
                {Array.from({ length: 23 - hourStart }, (_, i) => hourStart + 1 + i).map(
                  (h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ),
                )}
              </Select>
              <p className="text-xs text-[var(--muted-foreground)]">
                Último turno:{" "}
                {String(Math.max(hourEnd - 1, hourStart)).padStart(2, "0")}:00
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Feriados inamovibles (Argentina)</Label>
            <p className="text-xs text-[var(--muted-foreground)]">
              Desmarcá los días en los que sí atienden visitas.
            </p>
            <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {uniqueHolidayRows.map((row) => {
                const checked = enabledHolidays.includes(row.monthDay);
                return (
                  <li
                    key={row.monthDay}
                    className="flex items-start gap-3 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggleHoliday(row.monthDay)}
                      id={`hol-${row.monthDay}`}
                    />
                    <label htmlFor={`hol-${row.monthDay}`} className="flex-1 cursor-pointer">
                      <span className="font-medium">{row.name}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                        {row.monthDay.replace("-", "/")} ·{" "}
                        {row.dates.join(", ")}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-2">
            <Label>Días cerrados adicionales</Label>
            <p className="text-xs text-[var(--muted-foreground)]">
              Puentes, vacaciones u otros feriados no inamovibles.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                type="date"
                value={extraDate}
                onChange={(e) => setExtraDate(e.target.value)}
                className="max-w-[200px]"
              />
              <Button type="button" variant="outline" onClick={addClosedDate}>
                Agregar
              </Button>
            </div>
            {closedDates.length > 0 ? (
              <ul className="space-y-1">
                {closedDates.map((d) => (
                  <li
                    key={d}
                    className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                  >
                    <span>{formatClosedLabel(d)}</span>
                    <button
                      type="button"
                      className="text-xs text-[var(--destructive)]"
                      onClick={() =>
                        setClosedDates((prev) => prev.filter((x) => x !== d))
                      }
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">
                Sin cierres extra.
              </p>
            )}
          </div>

          {error ? (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          ) : null}
          {saved ? (
            <p className="text-sm text-emerald-700">{saved}</p>
          ) : null}

          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar agenda"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
