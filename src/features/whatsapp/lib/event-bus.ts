import type { WhatsAppInboxEvent } from "@/features/whatsapp/lib/types";

type Listener = (event: WhatsAppInboxEvent) => void;

type BusState = {
  listenersByOrg: Map<string, Set<Listener>>;
};

/**
 * Singleton en globalThis: en Next/Turbopack el módulo puede cargarse
 * más de una vez (SSE vs server actions) y un Map de módulo no se comparte.
 */
const globalForBus = globalThis as unknown as {
  __erpWhatsAppInboxBus?: BusState;
};

const bus: BusState =
  globalForBus.__erpWhatsAppInboxBus ??
  (globalForBus.__erpWhatsAppInboxBus = {
    listenersByOrg: new Map(),
  });

/**
 * Bus de eventos en memoria para notificaciones en tiempo real (SSE).
 * En despliegues multi-instancia, reemplazar por Redis pub/sub o Socket.io adapter.
 */
export function subscribeWhatsAppInbox(
  organizationId: string,
  listener: Listener,
): () => void {
  const set = bus.listenersByOrg.get(organizationId) ?? new Set<Listener>();
  set.add(listener);
  bus.listenersByOrg.set(organizationId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) bus.listenersByOrg.delete(organizationId);
  };
}

export function publishWhatsAppInboxEvent(event: WhatsAppInboxEvent): void {
  const listeners = bus.listenersByOrg.get(event.organizationId);
  if (!listeners?.size) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("whatsapp inbox listener", err);
    }
  }
}
