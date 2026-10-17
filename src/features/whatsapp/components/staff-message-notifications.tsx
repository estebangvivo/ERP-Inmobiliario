"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWhatsAppInboxRealtime } from "@/features/whatsapp/components/use-inbox-realtime";
import type { WhatsAppInboxEvent } from "@/features/whatsapp/lib/types";
import { cn } from "@/lib/utils";

type ToastItem = {
  id: string;
  title: string;
  body: string;
  href: string;
};

type DeskSnapshot = {
  unreadCount: number;
  latest: {
    threadId: string;
    messageId: string;
    preview: string;
    senderName: string;
    title: string | null;
    href: string;
    createdAt: string;
  } | null;
};

type StaffNotificationsContextValue = {
  deskUnread: number;
  bumpDeskUnread: () => void;
  clearDeskUnreadDelta: (delta?: number) => void;
  setDeskUnread: (n: number) => void;
};

const StaffNotificationsContext =
  createContext<StaffNotificationsContextValue | null>(null);

export function useStaffNotifications() {
  return useContext(StaffNotificationsContext);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

function payloadString(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const v = payload?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}

function shouldNotifyUser(
  event: WhatsAppInboxEvent,
  userId: string,
): boolean {
  const ids = asStringArray(event.payload?.notifyUserIds);
  if (ids.length === 0) return false;
  return ids.includes(userId);
}

function toastFromEvent(event: WhatsAppInboxEvent): ToastItem | null {
  const href =
    payloadString(event.payload, "href") ??
    (event.threadId
      ? `/whatsapp/equipo?thread=${event.threadId}`
      : event.sessionId
        ? `/whatsapp?session=${event.sessionId}`
        : "/whatsapp");
  const preview = payloadString(event.payload, "preview") ?? "Nuevo mensaje";
  const sender =
    payloadString(event.payload, "senderName") ??
    payloadString(event.payload, "title") ??
    "Mensaje";

  if (event.type === "desk.message.created") {
    return {
      id: `${event.type}-${event.payload?.messageId ?? Date.now()}`,
      title: `Equipo · ${sender}`,
      body: preview,
      href,
    };
  }
  if (event.type === "message.created") {
    return {
      id: `${event.type}-${event.payload?.messageId ?? Date.now()}`,
      title: `WhatsApp · ${sender}`,
      body: preview,
      href,
    };
  }
  if (event.type === "session.waiting_agent") {
    return {
      id: `${event.type}-${event.sessionId ?? Date.now()}`,
      title: "WhatsApp · consulta en espera",
      body: preview,
      href,
    };
  }
  return null;
}

function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => void ctx.close(), 500);
  } catch {
    /* ignore */
  }
}

function showBrowserNotification(toast: ToastItem) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return;
  try {
    const n = new Notification(toast.title, {
      body: toast.body,
      tag: toast.id,
    });
    n.onclick = () => {
      window.focus();
      window.location.href = toast.href;
      n.close();
    };
  } catch {
    /* ignore */
  }
}

function viewingDeskThread(threadId: string | undefined) {
  if (!threadId || typeof window === "undefined") return false;
  return (
    window.location.pathname.startsWith("/whatsapp/equipo") &&
    window.location.search.includes(`thread=${threadId}`)
  );
}

export function StaffMessageNotifications({
  userId,
  enabled,
  initialDeskUnread = 0,
  children,
}: {
  userId: string;
  enabled: boolean;
  initialDeskUnread?: number;
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [deskUnread, setDeskUnread] = useState(initialDeskUnread);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    setDeskUnread(initialDeskUnread);
  }, [initialDeskUnread]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [enabled]);

  const bumpDeskUnread = useCallback(() => {
    setDeskUnread((n) => n + 1);
  }, []);

  const clearDeskUnreadDelta = useCallback((delta = 1) => {
    setDeskUnread((n) => Math.max(0, n - delta));
  }, []);

  const pushToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => {
      if (prev.some((t) => t.id === toast.id)) return prev;
      return [toast, ...prev].slice(0, 4);
    });
    playChime();
    showBrowserNotification(toast);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 10_000);
  }, []);

  const applySnapshot = useCallback(
    (snapshot: DeskSnapshot, { announce }: { announce: boolean }) => {
      setDeskUnread(snapshot.unreadCount);
      const latest = snapshot.latest;
      if (!latest) return;

      if (!primedRef.current) {
        seenMessageIdsRef.current.add(latest.messageId);
        primedRef.current = true;
        return;
      }

      if (seenMessageIdsRef.current.has(latest.messageId)) return;
      seenMessageIdsRef.current.add(latest.messageId);

      if (!announce) return;
      if (viewingDeskThread(latest.threadId)) return;

      pushToast({
        id: `desk.poll-${latest.messageId}`,
        title: `Equipo · ${latest.senderName}`,
        body: latest.preview,
        href: latest.href,
      });
    },
    [pushToast],
  );

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const pull = async (announce: boolean) => {
      try {
        const res = await fetch("/api/whatsapp/desk-notifications", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as DeskSnapshot;
        applySnapshot(data, { announce });
      } catch {
        /* ignore transient */
      }
    };

    void pull(false);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void pull(true);
    }, 4_000);

    const onFocus = () => void pull(true);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, applySnapshot]);

  useWhatsAppInboxRealtime((event) => {
    if (!shouldNotifyUser(event, userId)) return;
    const toast = toastFromEvent(event);
    if (!toast) return;

    const messageId = payloadString(event.payload, "messageId");
    if (messageId) {
      if (seenMessageIdsRef.current.has(messageId)) return;
      seenMessageIdsRef.current.add(messageId);
    }

    if (event.type === "desk.message.created") {
      if (viewingDeskThread(event.threadId)) return;
      bumpDeskUnread();
    }

    pushToast(toast);
  }, enabled);

  const value = useMemo(
    () => ({
      deskUnread,
      bumpDeskUnread,
      clearDeskUnreadDelta,
      setDeskUnread,
    }),
    [deskUnread, bumpDeskUnread, clearDeskUnreadDelta],
  );

  return (
    <StaffNotificationsContext.Provider value={value}>
      {children}
      {enabled ? (
        <>
          {deskUnread > 0 ? (
            <Link
              href="/whatsapp/equipo"
              className="fixed bottom-4 left-4 z-[60] inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium shadow-lg hover:bg-[var(--muted)] md:left-auto md:right-4 md:bottom-auto md:top-16"
            >
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">
                {deskUnread > 9 ? "9+" : deskUnread}
              </span>
              Mensaje{deskUnread === 1 ? "" : "s"} de equipo
            </Link>
          ) : null}
          <div
            className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
            aria-live="polite"
          >
            {toasts.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                onClick={() =>
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                }
                className={cn(
                  "pointer-events-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-lg",
                  "transition hover:bg-[var(--muted)]",
                )}
              >
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {t.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted-foreground)]">
                  {t.body}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </StaffNotificationsContext.Provider>
  );
}
