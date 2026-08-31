const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function monthIndex(year: number, month: number) {
  return year * 12 + (month - 1);
}

function utcYearMonth(date: Date): { year: number; month: number } {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

export type InstallmentInfo = {
  number: number;
  total: number;
  periodMonth: number;
  periodYear: number;
  monthName: string;
};

/** Calcula N° de cuota y total a partir del rango del contrato y el período. */
export function getInstallmentInfo(input: {
  contractStart: Date;
  contractEnd: Date;
  periodYear: number;
  periodMonth: number;
}): InstallmentInfo | null {
  const start = utcYearMonth(input.contractStart);
  const end = utcYearMonth(input.contractEnd);
  const startIdx = monthIndex(start.year, start.month);
  const endIdx = monthIndex(end.year, end.month);
  const periodIdx = monthIndex(input.periodYear, input.periodMonth);

  const total = endIdx - startIdx + 1;
  if (total < 1) return null;

  const number = periodIdx - startIdx + 1;
  if (number < 1 || number > total) {
    // Fuera del rango del contrato: igual mostramos período legible.
    return null;
  }

  return {
    number,
    total,
    periodMonth: input.periodMonth,
    periodYear: input.periodYear,
    monthName: MONTH_NAMES_ES[input.periodMonth - 1] ?? String(input.periodMonth),
  };
}

export function formatPeriodMonthYear(periodMonth: number, periodYear: number) {
  const name = MONTH_NAMES_ES[periodMonth - 1] ?? String(periodMonth);
  return `${name} ${periodYear}`;
}

/**
 * Ej: "Cuota 1 de 12 (Agosto 2026)".
 * Si no se puede calcular el N°, cae a "Agosto 2026".
 */
export function formatInstallmentLabel(input: {
  contractStart: Date;
  contractEnd: Date;
  periodYear: number;
  periodMonth: number;
}): string {
  const info = getInstallmentInfo(input);
  const period = formatPeriodMonthYear(input.periodMonth, input.periodYear);
  if (!info) return period;
  return `Cuota ${info.number} de ${info.total} (${period})`;
}
