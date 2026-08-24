"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgendaVisitForm } from "@/components/erp/agenda-visit-form";
import type { VisitBookableProperty } from "@/server/actions/visit-bookings";

export type AgendaVisitItem = {
  id: string;
  startsAt: string;
  timeLabel: string;
  name: string;
  propertyTitle: string;
  assigneeName: string | null;
  status: "RESERVED" | "COMPLETED";
};

export type AgendaMonthCell = {
  dateKey: string;
  day: number;
  inMonth: boolean;
};

type Props = {
  year: number;
  month: number;
  monthLabel: string;
  todayKey: string;
  cells: AgendaMonthCell[];
  visitsByDay: Record<string, AgendaVisitItem[]>;
  properties: VisitBookableProperty[];
  scheduleSummary: string;
  canCreate: boolean;
  prevHref: string;
  nextHref: string;
};

const WEEKDAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function AgendaMonthPanel({
  year,
  month,
  monthLabel,
  todayKey,
  cells,
  visitsByDay,
  properties,
  scheduleSummary,
  canCreate,
  prevHref,
  nextHref,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);
  const [showForm, setShowForm] = useState(false);
  const [formDateKey, setFormDateKey] = useState<string | undefined>();
  const [formInstance, setFormInstance] = useState(0);

  const selectedVisits = useMemo(
    () => (selectedKey ? (visitsByDay[selectedKey] ?? []) : []),
    [selectedKey, visitsByDay],
  );

  function openForm(dateKey?: string) {
    setFormDateKey(dateKey);
    if (dateKey) setSelectedKey(dateKey);
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold capitalize">{monthLabel}</h3>
          <div className="flex items-center gap-1">
            <Link
              href={prevHref}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href={nextHref}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <p className="w-full text-xs text-[var(--muted-foreground)] sm:w-auto">
            Turnos ({scheduleSummary}). También propiedades fuera del portal.
          </p>
        </div>
        {canCreate ? (
          <Button size="sm" type="button" onClick={() => openForm(selectedKey ?? undefined)}>
            <Plus className="size-4" />
            Nueva visita
          </Button>
        ) : null}
      </div>

      {showForm && canCreate ? (
        <AgendaVisitForm
          key={`${formDateKey ?? "new"}-${formInstance}`}
          properties={properties}
          defaultDateKey={formDateKey}
          onCancel={() => {
            setShowForm(false);
            setFormDateKey(undefined);
          }}
          onBookedAnother={() => {
            setFormInstance((n) => n + 1);
          }}
        />
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--muted)]/40">
          {WEEKDAY_HEADERS.map((d) => (
            <div
              key={d}
              className="px-1 py-2 text-center text-xs font-medium text-[var(--muted-foreground)] sm:text-sm"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const dayVisits = visitsByDay[cell.dateKey] ?? [];
            const isToday = cell.dateKey === todayKey;
            const isSelected = cell.dateKey === selectedKey;
            return (
              <div
                key={cell.dateKey}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedKey(cell.dateKey)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedKey(cell.dateKey);
                  }
                }}
                onDoubleClick={() => {
                  if (canCreate) openForm(cell.dateKey);
                }}
                className={`min-h-[5.5rem] cursor-pointer border-b border-r border-[var(--border)] p-1.5 text-left align-top transition sm:min-h-[6.5rem] sm:p-2 ${
                  isSelected
                    ? "bg-[var(--primary)]/5 ring-2 ring-inset ring-[var(--primary)]"
                    : "hover:bg-[var(--muted)]/50"
                } ${!cell.inMonth ? "bg-[var(--muted)]/20" : ""}`}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                      isToday
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : cell.inMonth
                          ? "text-[var(--foreground)]"
                          : "text-[var(--muted-foreground)]"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {canCreate && cell.inMonth ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openForm(cell.dateKey);
                      }}
                      className="hidden rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] sm:inline-flex"
                      title="Agregar visita"
                      aria-label={`Agregar visita el ${cell.dateKey}`}
                    >
                      <Plus className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="space-y-0.5">
                  {dayVisits.slice(0, 3).map((v) => (
                    <p
                      key={v.id}
                      className="truncate rounded bg-[var(--muted)]/80 px-1 py-0.5 text-[10px] leading-tight text-[var(--foreground)] sm:text-xs"
                      title={`${v.timeLabel} · ${v.name} · ${v.propertyTitle}`}
                    >
                      <span className="font-medium">{v.timeLabel}</span>{" "}
                      {v.name}
                    </p>
                  ))}
                  {dayVisits.length > 3 ? (
                    <p className="px-1 text-[10px] text-[var(--muted-foreground)]">
                      +{dayVisits.length - 3} más
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedKey ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {new Intl.DateTimeFormat("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${selectedKey}T12:00:00.000Z`))}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {selectedVisits.length === 0
                  ? "Sin visitas este día"
                  : `${selectedVisits.length} visita${selectedVisits.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {canCreate ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openForm(selectedKey)}
              >
                + Visita
              </Button>
            ) : null}
          </div>
          {selectedVisits.length === 0 ? null : (
            <div className="space-y-2">
              {selectedVisits.map((v) => (
                <div
                  key={v.id}
                  className="rounded-md border border-[var(--border)] p-3 text-sm"
                >
                  <p className="font-medium">
                    {v.timeLabel} · {v.name}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {v.propertyTitle}
                    {v.assigneeName ? ` · ${v.assigneeName}` : ""}
                  </p>
                  <Badge
                    variant={v.status === "COMPLETED" ? "success" : "secondary"}
                    className="mt-1"
                  >
                    {v.status === "COMPLETED" ? "Completada" : "Reservada"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <p className="text-xs text-[var(--muted-foreground)]">
        {year}-{String(month).padStart(2, "0")} · Gestioná el detalle en{" "}
        <Link href="/visitas" className="text-[var(--primary)] underline">
          Visitas
        </Link>
        .
      </p>
    </div>
  );
}
