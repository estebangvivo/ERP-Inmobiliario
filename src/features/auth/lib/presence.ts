/** Umbral de presencia: heartbeat cada ~45s; 2 min de margen. */
export const ONLINE_MS = 2 * 60 * 1000;

export function isUserOnline(
  lastSeenAt: Date | string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastSeenAt) return false;
  const t =
    typeof lastSeenAt === "string"
      ? new Date(lastSeenAt).getTime()
      : lastSeenAt.getTime();
  return now - t < ONLINE_MS;
}

/** Texto de presencia para listados de admin. */
export function formatPresenceLabel(
  lastSeenAt: string | null,
  isOnline: boolean,
): string {
  if (isOnline) return "Conectado ahora";
  if (!lastSeenAt) return "Desconectado";
  const ms = Date.now() - new Date(lastSeenAt).getTime();
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `Hace ${days} d`;
}
