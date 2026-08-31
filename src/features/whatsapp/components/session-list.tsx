"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  assignWhatsAppAgentAction,
  closeWhatsAppSessionAction,
} from "@/features/whatsapp/actions/inbox-actions";
import type { EligibleWhatsAppAgent } from "@/features/whatsapp/services/agent-eligibility";
import type { SessionListItem } from "@/features/whatsapp/lib/types";
import { WHATSAPP_CHAT_STATUS_LABELS } from "@/features/whatsapp/lib/types";
import { formatDateTimeAR } from "@/lib/format-date";
import { cn } from "@/lib/utils";

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

  function select(id: string) {
    router.push(`/whatsapp?session=${id}`);
  }

  function assign(sessionId: string, agentUserId?: string) {
    startTransition(async () => {
      await assignWhatsAppAgentAction(sessionId, agentUserId ?? currentUserId);
      router.refresh();
    });
  }

  function close(sessionId: string) {
    startTransition(async () => {
      await closeWhatsAppSessionAction(sessionId);
      router.refresh();
    });
  }

  if (sessions.length === 0) {
    return (
      <p className="p-4 text-sm text-[var(--muted-foreground)]">
        No hay conversaciones todavía.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {sessions.map((s) => (
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
                  {s.lastMessagePreview ?? s.waContactPhone}
                </p>
              </div>
              <Badge variant={statusVariant(s.status)} className="shrink-0 text-[10px]">
                {WHATSAPP_CHAT_STATUS_LABELS[s.status]}
              </Badge>
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              {formatDateTimeAR(s.lastMessageAt)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {s.status === "WAITING_AGENT" ? (
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
                    Tomar chat
                  </Button>
                  {isAdmin && eligibleAgents.length > 0 ? (
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
                      <option value="">Asignar a…</option>
                      {eligibleAgents.map((agent) => (
                        <option key={agent.userId} value={agent.userId}>
                          {agent.name}
                          {agent.availableNow ? "" : " (fuera de horario)"}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </>
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
      ))}
    </ul>
  );
}
