"use client";

import { useEffect, useRef } from "react";
import type { WhatsAppInboxEvent } from "@/features/whatsapp/lib/types";

/**
 * SSE con reconexión automática. Usar en inbox, equipo y notificaciones globales.
 */
export function useWhatsAppInboxRealtime(
  onEvent: (event: WhatsAppInboxEvent) => void,
  enabled = true,
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let source: EventSource | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      source = new EventSource("/api/whatsapp/events");

      source.onmessage = (ev) => {
        attempt = 0;
        try {
          const data = JSON.parse(ev.data) as WhatsAppInboxEvent;
          handlerRef.current(data);
        } catch {
          /* ignore malformed */
        }
      };

      source.onerror = () => {
        source?.close();
        source = null;
        if (closed) return;
        const delay = Math.min(30_000, 1_000 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [enabled]);
}
