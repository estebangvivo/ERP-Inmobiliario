import {
  enabledHolidayDateKeys,
  resolveEnabledHolidayMonthDays,
} from "@/lib/ar-holidays";

/** Slots de visita configurables; default lun–vie 8:00–16:00 (1h), TZ Argentina. */

export const VISIT_TZ = "America/Argentina/Buenos_Aires";
export const VISIT_DAYS_AHEAD = 30;

/** Offset fijo ART (UTC-3). Suficiente para agenda de visitas. */
const ART_OFFSET_MS = -3 * 60 * 60 * 1000;

/** weekdays: 1=lun … 7=dom. hourEnd exclusivo. */
export type VisitScheduleConfig = {
  weekdays: number[];
  hourStart: number;
  hourEnd: number;
  closedDates: string[];
  /** MM-DD persistidos (vacío = todos; ver ar-holidays). */
  enabledHolidays: string[];
};

export const DEFAULT_VISIT_SCHEDULE: VisitScheduleConfig = {
  weekdays: [1, 2, 3, 4, 5],
  hourStart: 8,
  hourEnd: 16,
  closedDates: [],
  enabledHolidays: [],
};

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

/** Convierte weekday JS (0=dom) a 1=lun … 7=dom. */
export function jsWeekdayToIso(jsWeekday: number): number {
  return jsWeekday === 0 ? 7 : jsWeekday;
}

export function slotHoursForRange(hourStart: number, hourEnd: number): number[] {
  const hours: number[] = [];
  for (let h = hourStart; h < hourEnd; h++) hours.push(h);
  return hours;
}

export function normalizeVisitSchedule(
  partial: Partial<VisitScheduleConfig> | null | undefined,
): VisitScheduleConfig {
  const weekdays =
    partial?.weekdays?.filter((d) => d >= 1 && d <= 7) ??
    DEFAULT_VISIT_SCHEDULE.weekdays;
  const hourStart = partial?.hourStart ?? DEFAULT_VISIT_SCHEDULE.hourStart;
  const hourEnd = partial?.hourEnd ?? DEFAULT_VISIT_SCHEDULE.hourEnd;
  return {
    weekdays:
      weekdays.length > 0
        ? [...new Set(weekdays)].sort((a, b) => a - b)
        : [1, 2, 3, 4, 5],
    hourStart: Math.min(Math.max(hourStart, 0), 23),
    hourEnd: Math.min(Math.max(hourEnd, 1), 24),
    closedDates: [...(partial?.closedDates ?? [])],
    enabledHolidays: [...(partial?.enabledHolidays ?? [])],
  };
}

export function scheduleFromOrganization(org: {
  visitWeekdays: number[];
  visitHourStart: number;
  visitHourEnd: number;
  visitClosedDates: string[];
  visitEnabledHolidays: string[];
}): VisitScheduleConfig {
  return normalizeVisitSchedule({
    weekdays: org.visitWeekdays,
    hourStart: org.visitHourStart,
    hourEnd: org.visitHourEnd,
    closedDates: org.visitClosedDates,
    enabledHolidays: org.visitEnabledHolidays,
  });
}

/** Month-days efectivos (para UI checkboxes). */
export function effectiveEnabledHolidays(config: VisitScheduleConfig): string[] {
  return resolveEnabledHolidayMonthDays(config.enabledHolidays);
}

function closedDateKeys(
  config: VisitScheduleConfig,
  years: number[],
): Set<string> {
  const closed = new Set(config.closedDates);
  const holidays = enabledHolidayDateKeys(years, config.enabledHolidays);
  for (const k of holidays) closed.add(k);
  return closed;
}

/** Genera todos los slots teóricos de los próximos N días (sin filtrar ocupados). */
export function generateVisitSlots(
  from: Date = new Date(),
  daysAhead = VISIT_DAYS_AHEAD,
  configInput?: Partial<VisitScheduleConfig> | null,
): VisitSlot[] {
  const config = normalizeVisitSchedule(configInput);
  const hours = slotHoursForRange(config.hourStart, config.hourEnd);
  if (hours.length === 0) return [];

  const start = artParts(from);
  const years = new Set<number>();
  for (let d = 0; d < daysAhead; d++) {
    years.add(addArtDays(start.year, start.month, start.day, d).year);
  }
  const closed = closedDateKeys(config, [...years]);
  const weekdaySet = new Set(config.weekdays);
  const slots: VisitSlot[] = [];

  for (let d = 0; d < daysAhead; d++) {
    const day = addArtDays(start.year, start.month, start.day, d);
    const isoWeekday = jsWeekdayToIso(day.weekday);
    if (!weekdaySet.has(isoWeekday)) continue;

    const dateKey = `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
    if (closed.has(dateKey)) continue;

    for (const hour of hours) {
      const startsAt = artLocalToUtc(day.year, day.month, day.day, hour, 0);
      const endsAt = artLocalToUtc(day.year, day.month, day.day, hour + 1, 0);
      if (startsAt <= from) continue;
      slots.push({
        startsAt,
        endsAt,
        dateKey,
        timeLabel: `${String(hour).padStart(2, "0")}:00`,
      });
    }
  }

  return slots;
}

export function isValidVisitSlot(
  startsAt: Date,
  now = new Date(),
  configInput?: Partial<VisitScheduleConfig> | null,
): boolean {
  if (startsAt <= now) return false;
  const config = normalizeVisitSchedule(configInput);
  const p = artParts(startsAt);
  if (p.minute !== 0) return false;

  const isoWeekday = jsWeekdayToIso(p.weekday);
  if (!config.weekdays.includes(isoWeekday)) return false;

  const hours = slotHoursForRange(config.hourStart, config.hourEnd);
  if (!hours.includes(p.hour)) return false;

  const dateKey = formatArtDateKey(startsAt);
  const closed = closedDateKeys(config, [p.year, p.year + 1]);
  if (closed.has(dateKey)) return false;

  return true;
}

export function formatScheduleSummary(config: VisitScheduleConfig): string {
  const dayNames = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
  const isMonFri =
    config.weekdays.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => config.weekdays.includes(d));
  const days = isMonFri
    ? "lun–vie"
    : config.weekdays.map((d) => dayNames[d]).join(", ");
  const start = `${String(config.hourStart).padStart(2, "0")}:00`;
  const end = `${String(config.hourEnd).padStart(2, "0")}:00`;
  return `${days} ${start}–${end}`;
}
