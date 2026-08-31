"use client";

import { useEffect, useRef } from "react";
import type { WhatsAppInboxEvent } from "@/features/whatsapp/lib/types";

export function useWhatsAppInboxRealtime(onEvent: (event: WhatsAppInboxEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource("/api/whatsapp/events");

    source.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as WhatsAppInboxEvent;
        handlerRef.current(data);
      } catch {
        /* ignore malformed */
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, []);
}
