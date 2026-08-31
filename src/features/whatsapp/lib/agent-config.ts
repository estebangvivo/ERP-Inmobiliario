import type { WhatsAppRoutingMode } from "@prisma/client";
import { VISIT_TZ } from "@/lib/visit-slots";

export type WhatsAppAgentSchedule = {
  weekdays: number[];
  hourStart: number;
  hourEnd: number;
};

export type WhatsAppAgentConfigRow = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  enabled: boolean;
  priority: number;
  schedule: WhatsAppAgentSchedule;
};

export type WhatsAppOrgConfig = {
  waPhoneNumberId: string | null;
  waDisplayPhone: string | null;
  routingMode: WhatsAppRoutingMode;
  configured: boolean;
  hasAccessToken: boolean;
  hasVerifyToken: boolean;
  webhookUrl: string;
  graphApiVersion: string;
};

export const WHATSAPP_ROUTING_MODE_LABELS: Record<WhatsAppRoutingMode, string> = {
  MANUAL: "Manual (los agentes toman el chat)",
  ROUND_ROBIN: "Rotativo (asigna al siguiente agente disponible)",
  LEAST_BUSY: "Menor carga (asigna al que tiene menos chats activos)",
};

export const WHATSAPP_WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

export const WHATSAPP_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export const DEFAULT_WHATSAPP_AGENT_SCHEDULE: WhatsAppAgentSchedule = {
  weekdays: [1, 2, 3, 4, 5],
  hourStart: 9,
  hourEnd: 18,
};

/** Hora y día de la semana (1=lun) en Argentina. */
export function getArgentinaNowParts(date = new Date()): {
  weekday: number;
  hour: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: VISIT_TZ,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekdayRaw = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return { weekday: weekdayMap[weekdayRaw] ?? 1, hour };
}

export function isWithinAgentSchedule(
  schedule: WhatsAppAgentSchedule,
  date = new Date(),
): boolean {
  const { weekday, hour } = getArgentinaNowParts(date);
  if (!schedule.weekdays.includes(weekday)) return false;
  if (hour < schedule.hourStart) return false;
  if (hour >= schedule.hourEnd) return false;
  return true;
}

export function formatAgentScheduleSummary(schedule: WhatsAppAgentSchedule): string {
  const dayLabels = WHATSAPP_WEEKDAYS.filter((d) =>
    schedule.weekdays.includes(d.value),
  ).map((d) => d.label);
  const days = dayLabels.length > 0 ? dayLabels.join(", ") : "Sin días";
  return `${days} · ${String(schedule.hourStart).padStart(2, "0")}:00–${String(schedule.hourEnd).padStart(2, "0")}:00 (ART)`;
}
