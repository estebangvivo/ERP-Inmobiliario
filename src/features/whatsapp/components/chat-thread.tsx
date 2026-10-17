"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assignWhatsAppAgentAction,
  releaseWhatsAppSessionAction,
  sendWhatsAppReplyAction,
} from "@/features/whatsapp/actions/inbox-actions";
import type { BotPayload, MessageListItem } from "@/features/whatsapp/lib/types";
import {
  WHATSAPP_AGENT_AREA_LABELS,
  WHATSAPP_CHAT_STATUS_LABELS,
  WHATSAPP_INTENT_LABELS,
} from "@/features/whatsapp/lib/types";
import { formatDateTimeAR } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { WhatsAppAgentArea } from "@prisma/client";
import Link from "next/link";

type ThreadSession = {
  id: string;
  waContactPhone: string;
  waContactName: string | null;
  status: keyof typeof WHATSAPP_CHAT_STATUS_LABELS;
  assignedAgentName: string | null;
  assignedAgentId?: string | null;
  requestedArea?: WhatsAppAgentArea | null;
  botPayload?: BotPayload | null;
  leadId: string | null;
  leadName: string | null;
};

function QualificationCard({
  area,
  payload,
}: {
  area?: WhatsAppAgentArea | null;
  payload?: BotPayload | null;
}) {
  if (!area && !payload) return null;
  return (
    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2 text-xs">
      {area ? (
        <p>
          <span className="font-medium">Área:</span>{" "}
          {WHATSAPP_AGENT_AREA_LABELS[area]}
        </p>
      ) : null}
      {payload?.intent ? (
        <p>
          <span className="font-medium">Intención:</span>{" "}
          {WHATSAPP_INTENT_LABELS[payload.intent]}
        </p>
      ) : null}
      {payload?.zone ? (
        <p>
          <span className="font-medium">Zona:</span> {payload.zone}
        </p>
      ) : null}
      {payload?.budget ? (
        <p>
          <span className="font-medium">Presupuesto:</span> {payload.budget}
        </p>
      ) : null}
      {payload?.propertyType ? (
        <p>
          <span className="font-medium">Tipo:</span> {payload.propertyType}
        </p>
      ) : null}
      {payload?.areaNote ? (
        <p>
          <span className="font-medium">Consulta:</span> {payload.areaNote}
        </p>
      ) : null}
    </div>
  );
}

export function ChatThread({
  session,
  messages,
  canReply,
  currentUserId,
}: {
  session: ThreadSession;
  messages: MessageListItem[];
  canReply: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await sendWhatsAppReplyAction(null, formData);
      if (result.ok) router.refresh();
      else if (result.error) window.alert(result.error);
    });
  }

  const isMine =
    session.status === "AGENT_HANDLED" &&
    session.assignedAgentId === currentUserId;
  const replyDisabled =
    !canReply ||
    session.status === "BOT_ACTIVE" ||
    session.status === "CLOSED" ||
    (session.status === "WAITING_AGENT" && !isMine) ||
    (session.status === "AGENT_HANDLED" && !isMine);

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">
              {session.waContactName ?? session.waContactPhone}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {session.waContactPhone} ·{" "}
              {WHATSAPP_CHAT_STATUS_LABELS[session.status]}
              {session.assignedAgentName
                ? ` · ${session.assignedAgentName}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {session.status === "WAITING_AGENT" ? (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await assignWhatsAppAgentAction(session.id, currentUserId);
                    router.refresh();
                  })
                }
              >
                Tomar control
              </Button>
            ) : null}
            {session.status === "AGENT_HANDLED" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await releaseWhatsAppSessionAction(session.id);
                    router.refresh();
                  })
                }
              >
                Devolver al bot
              </Button>
            ) : null}
            <Link
              href={`/whatsapp/equipo?from=${session.id}`}
              className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-xs font-medium hover:bg-[var(--muted)]"
            >
              Consultar con agente
            </Link>
          </div>
        </div>
        <QualificationCard area={session.requestedArea} payload={session.botPayload} />
        {session.leadId ? (
          <a
            href={`/leads`}
            className="mt-1 inline-block text-xs text-[var(--primary)] hover:underline"
          >
            Lead: {session.leadName ?? session.leadId}
          </a>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Sin mensajes todavía.
          </p>
        ) : (
          messages.map((m) => {
            const outbound = m.direction === "OUTBOUND";
            return (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  outbound
                    ? "ml-auto bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--muted)]",
                )}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px] opacity-70",
                    outbound ? "" : "text-[var(--muted-foreground)]",
                  )}
                >
                  {m.senderType === "BOT"
                    ? "Bot"
                    : m.senderType === "AGENT"
                      ? (m.sentByUserName ?? "Agente")
                      : "Cliente"}{" "}
                  · {formatDateTimeAR(m.createdAt)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form
        action={handleSubmit}
        className="flex gap-2 border-t border-[var(--border)] p-3"
      >
        <input type="hidden" name="sessionId" value={session.id} />
        <Input
          name="body"
          placeholder={
            replyDisabled
              ? session.status === "WAITING_AGENT"
                ? "Tomá el control para responder"
                : "Solo el agente asignado puede responder"
              : "Escribí un mensaje…"
          }
          disabled={replyDisabled || pending}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={replyDisabled || pending}>
          {pending ? "…" : "Enviar"}
        </Button>
      </form>
    </div>
  );
}
