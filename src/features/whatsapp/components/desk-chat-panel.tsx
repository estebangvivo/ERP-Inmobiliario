"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createDeskThreadAction,
  sendDeskMessageAction,
} from "@/features/whatsapp/actions/desk-actions";
import { useWhatsAppInboxRealtime } from "@/features/whatsapp/components/use-inbox-realtime";
import { useStaffNotifications } from "@/features/whatsapp/components/staff-message-notifications";
import { WHATSAPP_AGENT_AREA_LABELS } from "@/features/whatsapp/lib/areas";
import { formatDateTimeAR } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { WhatsAppAgentArea } from "@prisma/client";

type AgentOption = {
  userId: string;
  name: string;
  email: string;
  areas: WhatsAppAgentArea[];
};

type ThreadListItem = {
  id: string;
  title: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unread?: boolean;
  participants: { userId: string; name: string }[];
  relatedWhatsAppSession: {
    id: string;
    name: string;
    area: WhatsAppAgentArea | null;
  } | null;
};

type ThreadDetail = {
  id: string;
  title: string | null;
  participants: { userId: string; name: string; email: string }[];
  relatedWhatsAppSession: {
    id: string;
    name: string;
    phone: string;
    area: WhatsAppAgentArea | null;
    status: string;
  } | null;
  messages: {
    id: string;
    body: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  }[];
};

export function DeskChatPanel({
  threads,
  thread,
  agents,
  currentUserId,
  selectedThreadId,
  prefill,
}: {
  threads: ThreadListItem[];
  thread: ThreadDetail | null;
  agents: AgentOption[];
  currentUserId: string;
  selectedThreadId?: string;
  prefill?: { sessionId: string; title: string; summary: string } | null;
}) {
  const router = useRouter();
  const notifications = useStaffNotifications();
  const [pending, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(Boolean(prefill));
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [message, setMessage] = useState(prefill?.summary ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefill) {
      setShowNew(true);
      setTitle(prefill.title);
      setMessage(prefill.summary);
    }
  }, [prefill]);

  useEffect(() => {
    if (!selectedThreadId || !notifications) return;
    const wasUnread = threads.some(
      (t) => t.id === selectedThreadId && t.unread,
    );
    if (wasUnread) notifications.clearDeskUnreadDelta(1);
  }, [selectedThreadId, threads, notifications]);

  useWhatsAppInboxRealtime(() => router.refresh());

  const otherParticipants = useMemo(() => {
    if (!thread) return "";
    return thread.participants
      .filter((p) => p.userId !== currentUserId)
      .map((p) => p.name)
      .join(", ");
  }, [thread, currentUserId]);

  function toggleAgent(userId: string) {
    setSelectedAgents((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  function createThread() {
    setError(null);
    if (selectedAgents.length === 0) {
      setError("Elegí al menos un compañero.");
      return;
    }
    if (!message.trim()) {
      setError("Escribí un mensaje inicial.");
      return;
    }
    startTransition(async () => {
      const result = await createDeskThreadAction({
        participantUserIds: selectedAgents,
        title: title.trim() || undefined,
        relatedWhatsAppSessionId: prefill?.sessionId,
        initialMessage: message.trim(),
      });
      if (!result.ok) {
        setError(result.error ?? "Error");
        return;
      }
      setShowNew(false);
      router.push(`/whatsapp/equipo?thread=${result.threadId}`);
      router.refresh();
    });
  }

  function sendReply(formData: FormData) {
    startTransition(async () => {
      const result = await sendDeskMessageAction(null, formData);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/whatsapp"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--muted)]"
        >
          Inbox
        </Link>
        <Link
          href="/whatsapp/equipo"
          className="rounded-md bg-[var(--primary)] px-3 py-1.5 font-medium text-[var(--primary-foreground)]"
        >
          Equipo
        </Link>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? "Cancelar" : "Nuevo chat"}
        </Button>
      </div>

      {showNew ? (
        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="font-semibold">Nueva conversación interna</h3>
          <div className="space-y-1">
            <Label>Título (opcional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Participantes</Label>
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => {
                const active = selectedAgents.includes(a.userId);
                return (
                  <button
                    key={a.userId}
                    type="button"
                    onClick={() => toggleAgent(a.userId)}
                    className={cn(
                      "rounded-md border px-3 py-1 text-xs",
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-[var(--border)]",
                    )}
                  >
                    {a.name}
                    {a.areas.length
                      ? ` · ${a.areas.map((x) => WHATSAPP_AGENT_AREA_LABELS[x]).join("/")}`
                      : ""}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Mensaje</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />
          </div>
          {error ? (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          ) : null}
          <Button type="button" disabled={pending} onClick={createThread}>
            {pending ? "Creando…" : "Crear conversación"}
          </Button>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
            Hilos
          </div>
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted-foreground)]">
              Todavía no hay chats internos.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/whatsapp/equipo?thread=${t.id}`)
                    }
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-[var(--muted)]/50",
                      selectedThreadId === t.id && "bg-[var(--muted)]/70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          "truncate text-sm",
                          t.unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {t.title ||
                          t.participants
                            .filter((p) => p.userId !== currentUserId)
                            .map((p) => p.name)
                            .join(", ") ||
                          "Chat"}
                      </p>
                      {t.unread ? (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {t.lastMessagePreview ?? "Sin mensajes"}
                    </p>
                    {t.relatedWhatsAppSession ? (
                      <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                        WA: {t.relatedWhatsAppSession.name}
                        {t.relatedWhatsAppSession.area
                          ? ` · ${WHATSAPP_AGENT_AREA_LABELS[t.relatedWhatsAppSession.area]}`
                          : ""}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex min-h-[420px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {thread ? (
            <>
              <div className="border-b border-[var(--border)] px-4 py-3">
                <p className="font-semibold">
                  {thread.title || otherParticipants || "Chat interno"}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {thread.participants.map((p) => p.name).join(", ")}
                </p>
                {thread.relatedWhatsAppSession ? (
                  <Link
                    href={`/whatsapp?session=${thread.relatedWhatsAppSession.id}`}
                    className="mt-1 inline-block text-xs text-[var(--primary)] hover:underline"
                  >
                    Ver chat WhatsApp · {thread.relatedWhatsAppSession.name}
                  </Link>
                ) : null}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {thread.messages.map((m) => {
                  const mine = m.senderId === currentUserId;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        mine
                          ? "ml-auto bg-[var(--primary)] text-[var(--primary-foreground)]"
                          : "bg-[var(--muted)]",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-[10px] opacity-70">
                        {m.senderName} · {formatDateTimeAR(m.createdAt)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <form
                action={sendReply}
                className="flex gap-2 border-t border-[var(--border)] p-3"
              >
                <input type="hidden" name="threadId" value={thread.id} />
                <Input
                  name="body"
                  placeholder="Escribí a tu equipo…"
                  required
                  disabled={pending}
                  className="flex-1"
                />
                <Button type="submit" disabled={pending}>
                  Enviar
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--muted-foreground)]">
              Seleccioná un hilo o creá uno nuevo.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
