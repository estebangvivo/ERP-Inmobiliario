"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendWhatsAppReplyAction } from "@/features/whatsapp/actions/inbox-actions";
import type { MessageListItem } from "@/features/whatsapp/lib/types";
import { WHATSAPP_CHAT_STATUS_LABELS } from "@/features/whatsapp/lib/types";
import { formatDateTimeAR } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type ThreadSession = {
  id: string;
  waContactPhone: string;
  waContactName: string | null;
  status: keyof typeof WHATSAPP_CHAT_STATUS_LABELS;
  assignedAgentName: string | null;
  leadId: string | null;
  leadName: string | null;
};

export function ChatThread({
  session,
  messages,
  canReply,
}: {
  session: ThreadSession;
  messages: MessageListItem[];
  canReply: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await sendWhatsAppReplyAction(null, formData);
      if (result.ok) router.refresh();
    });
  }

  const replyDisabled =
    !canReply ||
    session.status === "BOT_ACTIVE" ||
    session.status === "CLOSED";

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <p className="font-semibold">
          {session.waContactName ?? session.waContactPhone}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {session.waContactPhone} · {WHATSAPP_CHAT_STATUS_LABELS[session.status]}
          {session.assignedAgentName
            ? ` · ${session.assignedAgentName}`
            : ""}
        </p>
        {session.leadId ? (
          <a
            href={`/leads`}
            className="text-xs text-[var(--primary)] hover:underline"
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
                      ? m.sentByUserName ?? "Agente"
                      : "Cliente"}{" "}
                  · {formatDateTimeAR(m.createdAt)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form action={handleSubmit} className="flex gap-2 border-t border-[var(--border)] p-3">
        <input type="hidden" name="sessionId" value={session.id} />
        <Input
          name="body"
          placeholder={
            replyDisabled
              ? "Asigná el chat para responder manualmente"
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
