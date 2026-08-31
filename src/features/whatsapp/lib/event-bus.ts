import type { WhatsAppInboxEvent } from "@/features/whatsapp/lib/types";

type Listener = (event: WhatsAppInboxEvent) => void;

const listenersByOrg = new Map<string, Set<Listener>>();

/**
 * Bus de eventos en memoria para notificaciones en tiempo real (SSE).
 * En despliegues multi-instancia, reemplazar por Redis pub/sub o Socket.io adapter.
 */
export function subscribeWhatsAppInbox(
  organizationId: string,
  listener: Listener,
): () => void {
  const set = listenersByOrg.get(organizationId) ?? new Set<Listener>();
  set.add(listener);
  listenersByOrg.set(organizationId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listenersByOrg.delete(organizationId);
  };
}

export function publishWhatsAppInboxEvent(event: WhatsAppInboxEvent): void {
  const listeners = listenersByOrg.get(event.organizationId);
  if (!listeners?.size) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("whatsapp inbox listener", err);
    }
  }
}
