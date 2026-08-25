import {
  enabledHolidayDateKeys,
  resolveEnabledHolidayMonthDays,
} from "@/lib/ar-holidays";

/** Slots de visita configurables; default lun–vie 8:00–16:00, TZ Argentina. */

export const VISIT_TZ = "America/Argentina/Buenos_Aires";
export const VISIT_DAYS_AHEAD = 30;

/** Offset fijo ART (UTC-3). Suficiente para agenda de visitas. */
const ART_OFFSET_MS = -3 * 60 * 60 * 1000;

export const VISIT_SLOT_MINUTES_OPTIONS = [60, 30, 15] as const;
export type VisitSlotMinutes = (typeof VISIT_SLOT_MINUTES_OPTIONS)[number];

export const VISIT_SLOT_MINUTES_LABELS: Record<VisitSlotMinutes, string> = {
  60: "1 hora",
  30: "30 minutos",
  15: "15 minutos",
};

/** weekdays: 1=lun … 7=dom. hourEnd exclusivo. */
export type VisitScheduleConfig = {
  weekdays: number[];
  hourStart: number;
  hourEnd: number;
  /** 60 | 30 | 15 */
  slotMinutes: VisitSlotMinutes;
  closedDates: string[];
  /** MM-DD persistidos (vacío = todos; ver ar-holidays). */
  enabledHolidays: string[];
};

export const DEFAULT_VISIT_SCHEDULE: VisitScheduleConfig = {
  weekdays: [1, 2, 3, 4, 5],
  hourStart: 8,
  hourEnd: 16,
  slotMinutes: 60,
  closedDates: [],
  enabledHolidays: [],
};

export type VisitSlot = {
  startsAt: Date;
  endsAt: Date;
  /** YYYY-MM-DD en ART */
  dateKey: string;
  /** HH:mm */
  timeLabel: string;
};

export type VisitSlotStart = {
  hour: number;
  minute: number;
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

/** Interpreta YYYY-MM-DD + hour/minute en ART → Date UTC. */
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

export function normalizeSlotMinutes(value: unknown): VisitSlotMinutes {
  if (value === 15 || value === 30 || value === 60) return value;
  if (value === "15" || value === "30" || value === "60") {
    return Number(value) as VisitSlotMinutes;
  }
  return 60;
}

/** Inicios de turno entre hourStart (incl.) y hourEnd (excl.). */
export function slotStartsForRange(
  hourStart: number,
  hourEnd: number,
  slotMinutes: VisitSlotMinutes,
): VisitSlotStart[] {
  const starts: VisitSlotStart[] = [];
  const from = hourStart * 60;
  const to = hourEnd * 60;
  for (let m = from; m + slotMinutes <= to; m += slotMinutes) {
    const hour = Math.floor(m / 60);
    const minute = m % 60;
    starts.push({
      hour,
      minute,
      timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    });
  }
  return starts;
}

/** @deprecated Preferir slotStartsForRange con duración. */
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
  const slotMinutes = normalizeSlotMinutes(
    partial?.slotMinutes ?? DEFAULT_VISIT_SCHEDULE.slotMinutes,
  );
  return {
    weekdays:
      weekdays.length > 0
        ? [...new Set(weekdays)].sort((a, b) => a - b)
        : [1, 2, 3, 4, 5],
    hourStart: Math.min(Math.max(hourStart, 0), 23),
    hourEnd: Math.min(Math.max(hourEnd, 1), 24),
    slotMinutes,
    closedDates: [...(partial?.closedDates ?? [])],
    enabledHolidays: [...(partial?.enabledHolidays ?? [])],
  };
}

export function scheduleFromOrganization(org: {
  visitWeekdays: number[];
  visitHourStart: number;
  visitHourEnd: number;
  visitSlotMinutes?: number | null;
  visitClosedDates: string[];
  visitEnabledHolidays: string[];
}): VisitScheduleConfig {
  return normalizeVisitSchedule({
    weekdays: org.visitWeekdays,
    hourStart: org.visitHourStart,
    hourEnd: org.visitHourEnd,
    slotMinutes: normalizeSlotMinutes(org.visitSlotMinutes),
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
  const starts = slotStartsForRange(
    config.hourStart,
    config.hourEnd,
    config.slotMinutes,
  );
  if (starts.length === 0) return [];

  const start = artParts(from);
  const years = new Set<number>();
  for (let d = 0; d < daysAhead; d++) {
    years.add(addArtDays(start.year, start.month, start.day, d).year);
  }
  const closed = closedDateKeys(config, [...years]);
  const weekdaySet = new Set(config.weekdays);
  const slots: VisitSlot[] = [];
  const durationMs = config.slotMinutes * 60 * 1000;

  for (let d = 0; d < daysAhead; d++) {
    const day = addArtDays(start.year, start.month, start.day, d);
    const isoWeekday = jsWeekdayToIso(day.weekday);
    if (!weekdaySet.has(isoWeekday)) continue;

    const dateKey = `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
    if (closed.has(dateKey)) continue;

    for (const s of starts) {
      const startsAt = artLocalToUtc(
        day.year,
        day.month,
        day.day,
        s.hour,
        s.minute,
      );
      if (startsAt <= from) continue;
      slots.push({
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMs),
        dateKey,
        timeLabel: s.timeLabel,
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

  if (p.minute % config.slotMinutes !== 0) return false;

  const isoWeekday = jsWeekdayToIso(p.weekday);
  if (!config.weekdays.includes(isoWeekday)) return false;

  const starts = slotStartsForRange(
    config.hourStart,
    config.hourEnd,
    config.slotMinutes,
  );
  if (!starts.some((s) => s.hour === p.hour && s.minute === p.minute)) {
    return false;
  }

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
  const slot = VISIT_SLOT_MINUTES_LABELS[config.slotMinutes];
  return `${days} ${start}–${end} · ${slot}`;
}

export function lastSlotStartLabel(config: VisitScheduleConfig): string {
  const starts = slotStartsForRange(
    config.hourStart,
    config.hourEnd,
    config.slotMinutes,
  );
  return starts[starts.length - 1]?.timeLabel ?? "—";
}
