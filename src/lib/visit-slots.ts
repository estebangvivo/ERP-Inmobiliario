/** Slots de visita: lun–vie 8:00–15:00 (1h), TZ Argentina. */

export const VISIT_TZ = "America/Argentina/Buenos_Aires";
export const VISIT_SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15] as const;
export const VISIT_DAYS_AHEAD = 30;

/** Offset fijo ART (UTC-3). Suficiente para agenda de visitas. */
const ART_OFFSET_MS = -3 * 60 * 60 * 1000;

export type VisitSlot = {
  startsAt: Date;
  endsAt: Date;
  /** YYYY-MM-DD en ART */
  dateKey: string;
  /** HH:00 */
  timeLabel: string;
};

function artParts(date: Date) {
  const shifted = new Date(date.getTime() + ART_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(), // 0=Dom … 6=Sáb
  };
}

/** Interpreta YYYY-MM-DD + hour en ART → Date UTC. */
export function artLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - ART_OFFSET_MS);
}

export function formatArtDateKey(date: Date): string {
  const p = artParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function formatArtTimeLabel(date: Date): string {
  const p = artParts(date);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function formatArtDisplay(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: VISIT_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function addArtDays(year: number, month: number, day: number, days: number) {
  const base = Date.UTC(year, month - 1, day) + days * 86400000;
  const d = new Date(base);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}

/** Genera todos los slots teóricos de los próximos N días (sin filtrar ocupados). */
export function generateVisitSlots(
  from: Date = new Date(),
  daysAhead = VISIT_DAYS_AHEAD,
): VisitSlot[] {
  const start = artParts(from);
  const slots: VisitSlot[] = [];

  for (let d = 0; d < daysAhead; d++) {
    const day = addArtDays(start.year, start.month, start.day, d);
    // 1=Lun … 5=Vie
    if (day.weekday < 1 || day.weekday > 5) continue;

    for (const hour of VISIT_SLOT_HOURS) {
      const startsAt = artLocalToUtc(day.year, day.month, day.day, hour, 0);
      const endsAt = artLocalToUtc(day.year, day.month, day.day, hour + 1, 0);
      if (startsAt <= from) continue;
      slots.push({
        startsAt,
        endsAt,
        dateKey: `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`,
        timeLabel: `${String(hour).padStart(2, "0")}:00`,
      });
    }
  }

  return slots;
}

export function isValidVisitSlot(startsAt: Date, now = new Date()): boolean {
  if (startsAt <= now) return false;
  const p = artParts(startsAt);
  if (p.weekday < 1 || p.weekday > 5) return false;
  if (p.minute !== 0) return false;
  return (VISIT_SLOT_HOURS as readonly number[]).includes(p.hour);
}
