/** Feriados inamovibles de Argentina (fecha fija, sin traslado). */

export type ArInamovible = {
  /** MM-DD */
  monthDay: string;
  name: string;
};

/** Sentinel persistido cuando la org desmarca todos los feriados nacionales. */
export const NO_NATIONAL_HOLIDAYS = "00-00";

export const AR_INAMOVIBLES: readonly ArInamovible[] = [
  { monthDay: "01-01", name: "Año Nuevo" },
  { monthDay: "03-24", name: "Día Nacional de la Memoria" },
  { monthDay: "04-02", name: "Día del Veterano y de los Caídos en Malvinas" },
  { monthDay: "05-01", name: "Día del Trabajador" },
  { monthDay: "05-25", name: "Día de la Revolución de Mayo" },
  {
    monthDay: "06-20",
    name: "Paso a la Inmortalidad del General Manuel Belgrano",
  },
  { monthDay: "07-09", name: "Día de la Independencia" },
  { monthDay: "12-08", name: "Inmaculada Concepción de María" },
  { monthDay: "12-25", name: "Navidad" },
] as const;

export type ArHolidayOccurrence = {
  dateKey: string;
  monthDay: string;
  name: string;
  year: number;
};

/** Todas las ocurrencias de inamovibles para los años indicados. */
export function listInamoviblesForYears(
  years: number[],
): ArHolidayOccurrence[] {
  const out: ArHolidayOccurrence[] = [];
  for (const year of years) {
    for (const h of AR_INAMOVIBLES) {
      out.push({
        dateKey: `${year}-${h.monthDay}`,
        monthDay: h.monthDay,
        name: h.name,
        year,
      });
    }
  }
  return out;
}

export function allInamovibleMonthDays(): string[] {
  return AR_INAMOVIBLES.map((h) => h.monthDay);
}

/**
 * Vacío en DB = todos los inamovibles (default de org nueva).
 * `00-00` = ninguno.
 * Lista explícita = solo esos MM-DD.
 */
export function resolveEnabledHolidayMonthDays(
  stored: string[] | null | undefined,
): string[] {
  if (!stored || stored.length === 0) return allInamovibleMonthDays();
  if (stored.length === 1 && stored[0] === NO_NATIONAL_HOLIDAYS) return [];
  return stored.filter((d) => d !== NO_NATIONAL_HOLIDAYS);
}

export function persistEnabledHolidays(selected: string[]): string[] {
  const cleaned = [
    ...new Set(
      selected.filter(
        (d) => /^\d{2}-\d{2}$/.test(d) && d !== NO_NATIONAL_HOLIDAYS,
      ),
    ),
  ].sort();
  if (cleaned.length === 0) return [NO_NATIONAL_HOLIDAYS];
  return cleaned;
}

/** Set de YYYY-MM-DD de feriados habilitados en el rango de años. */
export function enabledHolidayDateKeys(
  years: number[],
  enabledMonthDaysStored: string[] | null | undefined,
): Set<string> {
  const active = resolveEnabledHolidayMonthDays(enabledMonthDaysStored);
  const activeSet = new Set(active);
  const keys = new Set<string>();
  for (const occ of listInamoviblesForYears(years)) {
    if (activeSet.has(occ.monthDay)) keys.add(occ.dateKey);
  }
  return keys;
}
