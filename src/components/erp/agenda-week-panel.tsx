"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Props = {
  weekKeys: string[];
  todayKey: string;
  dayLabels: Record<string, string>;
  visitsByDay: Record<string, AgendaVisitItem[]>;
  properties: VisitBookableProperty[];
  scheduleSummary: string;
  canCreate: boolean;
};

export function AgendaWeekPanel({
  weekKeys,
  todayKey,
  dayLabels,
  visitsByDay,
  properties,
  scheduleSummary,
  canCreate,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [formDateKey, setFormDateKey] = useState<string | undefined>();
  const [formInstance, setFormInstance] = useState(0);

  function openForm(dateKey?: string) {
    setFormDateKey(dateKey);
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Visitas · semana</h3>
          <p className="text-xs text-[var(--muted-foreground)]">
            Turnos del portal ({scheduleSummary})
          </p>
        </div>
        {canCreate ? (
          <Button
            size="sm"
            type="button"
            onClick={() => openForm(undefined)}
          >
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {weekKeys.map((key) => {
          const dayVisits = visitsByDay[key] ?? [];
          const isToday = key === todayKey;
          return (
            <Card
              key={key}
              className={isToday ? "border-[var(--primary)]" : undefined}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardTitle className="text-sm leading-snug">
                  {dayLabels[key]}
                  {isToday ? (
                    <Badge className="ml-2" variant="secondary">
                      Hoy
                    </Badge>
                  ) : null}
                </CardTitle>
                {canCreate ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => openForm(key)}
                  >
                    + Visita
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {dayVisits.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Sin visitas
                  </p>
                ) : (
                  dayVisits.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-md border border-[var(--border)] p-2"
                    >
                      <p className="font-medium">
                        {v.timeLabel} · {v.name}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {v.propertyTitle}
                        {v.assigneeName ? ` · ${v.assigneeName}` : ""}
                      </p>
                      <Badge
                        variant={
                          v.status === "COMPLETED" ? "success" : "secondary"
                        }
                        className="mt-1"
                      >
                        {v.status === "COMPLETED" ? "Completada" : "Reservada"}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        Gestioná el detalle en{" "}
        <Link href="/visitas" className="text-[var(--primary)] underline">
          Visitas
        </Link>
        .
      </p>
    </div>
  );
}
