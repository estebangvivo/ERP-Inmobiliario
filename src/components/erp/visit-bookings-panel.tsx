"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  assignVisitBookingAction,
  updateVisitBookingStatusAction,
  type VisitBookingRow,
  type VisitStaffOption,
} from "@/server/actions/visit-bookings";
import {
  artLocalToUtc,
  formatArtDateKey,
  formatArtDisplay,
  formatArtTimeLabel,
  slotStartsForRange,
  type VisitScheduleConfig,
} from "@/lib/visit-slots";

const STATUS_LABEL: Record<VisitBookingRow["status"], string> = {
  RESERVED: "Reservada",
  CANCELLED: "Cancelada",
  COMPLETED: "Completada",
};

type ViewMode = "list" | "calendar";

const ART_OFFSET_MS = -3 * 60 * 60 * 1000;

function startOfArtWeekMonday(ref: Date): { y: number; m: number; d: number } {
  const shifted = new Date(ref.getTime() + ART_OFFSET_MS);
  const weekday = shifted.getUTCDay(); // 0 Dom
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - daysFromMonday,
    ),
  );
  return {
    y: monday.getUTCFullYear(),
    m: monday.getUTCMonth() + 1,
    d: monday.getUTCDate(),
  };
}

function addDaysYmd(y: number, m: number, d: number, days: number) {
  const base = Date.UTC(y, m - 1, d) + days * 86400000;
  const x = new Date(base);
  return {
    y: x.getUTCFullYear(),
    m: x.getUTCMonth() + 1,
    d: x.getUTCDate(),
  };
}

function weekDayKeys(anchor: Date, weekdays: number[]): string[] {
  const mon = startOfArtWeekMonday(anchor);
  const wanted = new Set(weekdays);
  // Mostrar lun–dom de la semana, filtrando a días configurados
  return [0, 1, 2, 3, 4, 5, 6]
    .map((i) => {
      const day = addDaysYmd(mon.y, mon.m, mon.d, i);
      const iso = i + 1; // 0=lun → 1
      return { iso, key: `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}` };
    })
    .filter((d) => wanted.has(d.iso))
    .map((d) => d.key);
}

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = artLocalToUtc(y!, m!, d!, 12, 0);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(utc);
}

export function VisitBookingsPanel({
  bookings,
  staff,
  schedule,
}: {
  bookings: VisitBookingRow[];
  staff: VisitStaffOption[];
  schedule: VisitScheduleConfig;
}) {
  const [view, setView] = useState<ViewMode>("calendar");
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [pending, startTransition] = useTransition();

  const slotRows = useMemo(
    () =>
      slotStartsForRange(
        schedule.hourStart,
        schedule.hourEnd,
        schedule.slotMinutes,
      ),
    [schedule.hourStart, schedule.hourEnd, schedule.slotMinutes],
  );

  const days = useMemo(
    () => weekDayKeys(weekAnchor, schedule.weekdays),
    [weekAnchor, schedule.weekdays],
  );

  function reload() {
    window.location.reload();
  }

  function setStatus(id: string, status: VisitBookingRow["status"]) {
    startTransition(async () => {
      await updateVisitBookingStatusAction(id, status);
      reload();
    });
  }

  function setAssignee(id: string, assigneeId: string) {
    startTransition(async () => {
      await assignVisitBookingAction(id, assigneeId || null);
      reload();
    });
  }

  function shiftWeek(delta: number) {
    setWeekAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * 7);
      return next;
    });
  }

  const activeBookings = bookings.filter((b) => b.status !== "CANCELLED");

  const byCell = useMemo(() => {
    const map = new Map<string, VisitBookingRow[]>();
    for (const b of activeBookings) {
      const starts = new Date(b.startsAt);
      const dateKey = formatArtDateKey(starts);
      const time = formatArtTimeLabel(starts);
      const key = `${dateKey}|${time}`;
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return map;
  }, [activeBookings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={view === "calendar" ? "default" : "outline"}
            onClick={() => setView("calendar")}
          >
            Calendario
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "list" ? "default" : "outline"}
            onClick={() => setView("list")}
          >
            Lista
          </Button>
        </div>
        {view === "calendar" ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => shiftWeek(-1)}
            >
              ← Semana
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setWeekAnchor(new Date())}
            >
              Hoy
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => shiftWeek(1)}
            >
              Semana →
            </Button>
          </div>
        ) : null}
      </div>

      {view === "calendar" ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-[720px] w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[var(--muted)]/40">
                <th className="w-16 border-b border-[var(--border)] px-2 py-2 text-left font-medium text-[var(--muted-foreground)]">
                  Hora
                </th>
                {days.map((dk) => (
                  <th
                    key={dk}
                    className="border-b border-l border-[var(--border)] px-2 py-2 text-left font-medium capitalize"
                  >
                    {dayLabel(dk)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotRows.map((slot) => (
                <tr key={slot.timeLabel} className="align-top">
                  <td className="border-b border-[var(--border)] px-2 py-2 font-medium text-[var(--muted-foreground)]">
                    {slot.timeLabel}
                  </td>
                  {days.map((dk) => {
                    const key = `${dk}|${slot.timeLabel}`;
                    const cell = byCell.get(key) ?? [];
                    return (
                      <td
                        key={key}
                        className="min-w-[120px] border-b border-l border-[var(--border)] p-1.5"
                      >
                        <div className="space-y-1">
                          {cell.map((b) => (
                            <div
                              key={b.id}
                              className={`rounded-md border px-2 py-1.5 ${
                                b.status === "COMPLETED"
                                  ? "border-emerald-200 bg-emerald-50"
                                  : "border-[var(--border)] bg-[var(--card)]"
                              }`}
                            >
                              <p className="line-clamp-1 font-medium">
                                {b.property.title}
                              </p>
                              <p className="line-clamp-1 text-[var(--muted-foreground)]">
                                {b.name}
                              </p>
                              <Select
                                className="mt-1 h-8 text-xs"
                                value={b.assigneeId ?? ""}
                                disabled={pending}
                                onChange={(e) =>
                                  setAssignee(b.id, e.target.value)
                                }
                              >
                                <option value="">Sin asignar</option>
                                {staff.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : bookings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center text-sm text-[var(--muted-foreground)]">
          Todavía no hay visitas agendadas desde el portal.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              <tr>
                <th className="px-4 py-3">Fecha y hora</th>
                <th className="px-4 py-3">Propiedad</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Asignado a</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-[var(--muted)]/30">
                  <td className="px-4 py-3 font-medium capitalize">
                    {formatArtDisplay(new Date(b.startsAt))}
                  </td>
                  <td className="px-4 py-3">{b.property.title}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {b.email}
                      {b.phone ? ` · ${b.phone}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      className="h-9 min-w-[140px]"
                      value={b.assigneeId ?? ""}
                      disabled={pending || b.status === "CANCELLED"}
                      onChange={(e) => setAssignee(b.id, e.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        b.status === "RESERVED"
                          ? "warning"
                          : b.status === "COMPLETED"
                            ? "success"
                            : "secondary"
                      }
                    >
                      {STATUS_LABEL[b.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {b.status === "RESERVED" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => setStatus(b.id, "COMPLETED")}
                          >
                            Completar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => setStatus(b.id, "CANCELLED")}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
