"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  assignWhatsAppAgentAction,
  closeWhatsAppSessionAction,
  releaseWhatsAppSessionAction,
} from "@/features/whatsapp/actions/inbox-actions";
import type { EligibleWhatsAppAgent } from "@/features/whatsapp/services/agent-eligibility";
import type { SessionListItem } from "@/features/whatsapp/lib/types";
import {
  WHATSAPP_AGENT_AREA_LABELS,
  WHATSAPP_CHAT_STATUS_LABELS,
  WHATSAPP_INTENT_LABELS,
} from "@/features/whatsapp/lib/types";
import { WHATSAPP_AGENT_AREAS } from "@/features/whatsapp/lib/areas";
import { formatDateTimeAR } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { WhatsAppAgentArea } from "@prisma/client";

function statusVariant(
  status: SessionListItem["status"],
): "success" | "warning" | "secondary" | "danger" {
  switch (status) {
    case "WAITING_AGENT":
      return "warning";
    case "AGENT_HANDLED":
      return "success";
    case "CLOSED":
      return "secondary";
    default:
      return "secondary";
  }
}

function payloadPreview(s: SessionListItem): string | null {
  const p = s.botPayload;
  if (!p) return null;
  const parts: string[] = [];
  if (p.intent) parts.push(WHATSAPP_INTENT_LABELS[p.intent]);
  if (p.zone) parts.push(p.zone);
  if (p.budget) parts.push(p.budget);
  if (p.propertyType) parts.push(p.propertyType);
  if (p.areaNote) parts.push(p.areaNote);
  return parts.length ? parts.join(" · ") : null;
}

export function SessionList({
  sessions,
  selectedId,
  currentUserId,
  eligibleAgents = [],
  isAdmin = false,
}: {
  sessions: SessionListItem[];
  selectedId?: string;
  currentUserId: string;
  eligibleAgents?: EligibleWhatsAppAgent[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (areaFilter && s.requestedArea !== areaFilter) return false;
      return true;
    });
  }, [sessions, statusFilter, areaFilter]);

  function select(id: string) {
    router.push(`/whatsapp?session=${id}`);
  }

  function assign(sessionId: string, agentUserId?: string) {
    startTransition(async () => {
      await assignWhatsAppAgentAction(sessionId, agentUserId ?? currentUserId);
      router.refresh();
    });
  }

  function release(sessionId: string) {
    startTransition(async () => {
      await releaseWhatsAppSessionAction(sessionId);
      router.refresh();
    });
  }

  function close(sessionId: string) {
    startTransition(async () => {
      await closeWhatsAppSessionAction(sessionId);
      router.refresh();
    });
  }

  function agentsForSession(s: SessionListItem): EligibleWhatsAppAgent[] {
    if (!s.requestedArea) return eligibleAgents;
    return eligibleAgents.filter(
      (a) =>
        a.areas.length === 0 ||
        a.areas.includes(s.requestedArea as WhatsAppAgentArea),
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-3 py-2">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 w-auto min-w-[120px] text-xs"
        >
          <option value="">Todos los estados</option>
          <option value="WAITING_AGENT">Esperando agente</option>
          <option value="AGENT_HANDLED">Con agente</option>
          <option value="BOT_ACTIVE">Bot activo</option>
          <option value="CLOSED">Cerrado</option>
        </Select>
        <Select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="h-8 w-auto min-w-[120px] text-xs"
        >
          <option value="">Todas las áreas</option>
          {WHATSAPP_AGENT_AREAS.map((area) => (
            <option key={area} value={area}>
              {WHATSAPP_AGENT_AREA_LABELS[area]}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="p-4 text-sm text-[var(--muted-foreground)]">
          No hay conversaciones con esos filtros.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {filtered.map((s) => {
            const preview = payloadPreview(s);
            const agents = agentsForSession(s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => select(s.id)}
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-[var(--muted)]/50",
                    selectedId === s.id && "bg-[var(--muted)]/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {s.waContactName ?? s.waContactPhone}
                      </p>
                      <p className="truncate text-xs text-[var(--muted-foreground)]">
                        {preview ?? s.lastMessagePreview ?? s.waContactPhone}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge
                        variant={statusVariant(s.status)}
                        className="text-[10px]"
                      >
                        {WHATSAPP_CHAT_STATUS_LABELS[s.status]}
                      </Badge>
                      {s.requestedArea ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {WHATSAPP_AGENT_AREA_LABELS[s.requestedArea]}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                    {formatDateTimeAR(s.lastMessageAt)}
                    {s.assignedAgentName ? ` · ${s.assignedAgentName}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.status === "WAITING_AGENT" ||
                    (s.status === "AGENT_HANDLED" &&
                      s.assignedAgentId !== currentUserId) ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={(e) => {
                            e.stopPropagation();
                            assign(s.id);
                          }}
                        >
                          Tomar control
                        </Button>
                        {(isAdmin || eligibleAgents.length > 1) &&
                        agents.length > 0 ? (
                          <select
                            className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs"
                            defaultValue=""
                            disabled={pending}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const userId = e.target.value;
                              if (!userId) return;
                              assign(s.id, userId);
                              e.target.value = "";
                            }}
                          >
                            <option value="">Derivar a…</option>
                            {agents.map((agent) => (
                              <option key={agent.userId} value={agent.userId}>
                                {agent.name}
                                {agent.availableNow ? "" : " (fuera de horario)"}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </>
                    ) : null}
                    {s.status === "AGENT_HANDLED" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={(e) => {
                          e.stopPropagation();
                          release(s.id);
                        }}
                      >
                        Devolver al bot
                      </Button>
                    ) : null}
                    {s.status !== "CLOSED" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={(e) => {
                          e.stopPropagation();
                          close(s.id);
                        }}
                      >
                        Cerrar
                      </Button>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
