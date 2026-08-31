"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  formatAgentScheduleSummary,
  getArgentinaNowParts,
  WHATSAPP_HOUR_OPTIONS,
  WHATSAPP_WEEKDAYS,
  type WhatsAppAgentConfigRow,
} from "@/features/whatsapp/lib/agent-config";
import { updateWhatsAppAgentsSettingsAction } from "@/features/whatsapp/actions/settings-actions";
import { cn } from "@/lib/utils";

type AgentDraft = WhatsAppAgentConfigRow;

function isAvailableNow(agent: AgentDraft): boolean {
  const { weekday, hour } = getArgentinaNowParts();
  if (!agent.enabled) return false;
  if (!agent.schedule.weekdays.includes(weekday)) return false;
  if (hour < agent.schedule.hourStart) return false;
  if (hour >= agent.schedule.hourEnd) return false;
  return true;
}

export function WhatsAppAgentsPanel({
  agents: initialAgents,
}: {
  agents: WhatsAppAgentConfigRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentDraft[]>(initialAgents);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function updateAgent(memberId: string, patch: Partial<AgentDraft>) {
    setAgents((prev) =>
      prev.map((a) => (a.memberId === memberId ? { ...a, ...patch } : a)),
    );
  }

  function toggleWeekday(memberId: string, day: number) {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.memberId !== memberId) return a;
        const weekdays = a.schedule.weekdays.includes(day)
          ? a.schedule.weekdays.length === 1
            ? a.schedule.weekdays
            : a.schedule.weekdays.filter((d) => d !== day)
          : [...a.schedule.weekdays, day].sort((x, y) => x - y);
        return {
          ...a,
          schedule: { ...a.schedule, weekdays },
        };
      }),
    );
  }

  function save() {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await updateWhatsAppAgentsSettingsAction({
        agents: agents.map((a) => ({
          memberId: a.memberId,
          enabled: a.enabled,
          priority: a.priority,
          weekdays: a.schedule.weekdays,
          hourStart: a.schedule.hourStart,
          hourEnd: a.schedule.hourEnd,
        })),
      });
      if (!result.ok) {
        setError(result.error ?? "Error al guardar.");
        return;
      }
      setSaved(result.message ?? "Guardado.");
      router.refresh();
    });
  }

  if (agents.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">
        No hay usuarios con rol <strong>Agente</strong> en esta inmobiliaria.
        Creá agentes desde{" "}
        <a href="/usuarios" className="text-[var(--primary)] hover:underline">
          Usuarios
        </a>
        .
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Agentes de WhatsApp</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Elegí qué agentes pueden atender y en qué horario. Expandí una fila
          para editar. La prioridad define el orden en asignación rotativa.
        </p>
      </div>

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
        {agents.map((agent) => {
          const available = isAvailableNow(agent);
          const expanded = expandedId === agent.memberId;
          return (
            <div key={agent.memberId} className="bg-[var(--card)]">
              <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={
                    expanded
                      ? `Contraer ${agent.name}`
                      : `Expandir ${agent.name}`
                  }
                  onClick={() =>
                    setExpandedId(expanded ? null : agent.memberId)
                  }
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(expanded ? null : agent.memberId)
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium">
                    {agent.name}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">
                    {agent.email}
                    {agent.enabled
                      ? ` · ${formatAgentScheduleSummary(agent.schedule)}`
                      : ""}
                  </span>
                </button>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  <Badge variant={agent.enabled ? "success" : "secondary"}>
                    {agent.enabled ? "Habilitado" : "Deshabilitado"}
                  </Badge>
                  {agent.enabled ? (
                    <Badge
                      variant={available ? "success" : "warning"}
                      className="hidden sm:inline-flex"
                    >
                      {available ? "Disponible" : "Fuera de horario"}
                    </Badge>
                  ) : null}
                </div>
              </div>

              {expanded ? (
                <div className="border-t border-[var(--border)] bg-[var(--muted)]/20 px-4 py-4 sm:px-12">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={agent.enabled}
                        onChange={(e) =>
                          updateAgent(agent.memberId, {
                            enabled: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-[var(--border)]"
                      />
                      Puede atender WhatsApp
                    </label>

                    <div className="space-y-1">
                      <Label>Prioridad</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={agent.priority}
                        onChange={(e) =>
                          updateAgent(agent.memberId, {
                            priority: Math.max(
                              0,
                              Math.min(100, Number(e.target.value) || 0),
                            ),
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2 lg:col-span-2">
                      <Label>Días de atención</Label>
                      <div className="flex flex-wrap gap-2">
                        {WHATSAPP_WEEKDAYS.map((day) => {
                          const active = agent.schedule.weekdays.includes(
                            day.value,
                          );
                          return (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() =>
                                toggleWeekday(agent.memberId, day.value)
                              }
                              className={cn(
                                "rounded-md border px-3 py-1 text-xs font-medium",
                                active
                                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                                  : "border-[var(--border)] bg-[var(--background)]",
                              )}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>Desde (hora ART)</Label>
                      <Select
                        value={String(agent.schedule.hourStart)}
                        onChange={(e) =>
                          setAgents((prev) =>
                            prev.map((a) =>
                              a.memberId === agent.memberId
                                ? {
                                    ...a,
                                    schedule: {
                                      ...a.schedule,
                                      hourStart: Number(e.target.value),
                                    },
                                  }
                                : a,
                            ),
                          )
                        }
                      >
                        {WHATSAPP_HOUR_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, "0")}:00
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Hasta (hora ART, exclusivo)</Label>
                      <Select
                        value={String(agent.schedule.hourEnd)}
                        onChange={(e) =>
                          setAgents((prev) =>
                            prev.map((a) =>
                              a.memberId === agent.memberId
                                ? {
                                    ...a,
                                    schedule: {
                                      ...a.schedule,
                                      hourEnd: Number(e.target.value),
                                    },
                                  }
                                : a,
                            ),
                          )
                        }
                      >
                        {WHATSAPP_HOUR_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, "0")}:00
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      {saved ? (
        <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
          {saved}
        </p>
      ) : null}

      <div className="mt-6">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar agentes"}
        </Button>
      </div>
    </section>
  );
}
