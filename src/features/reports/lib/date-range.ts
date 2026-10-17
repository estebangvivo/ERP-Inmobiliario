import { parseDateInput, toDateInputValue } from "@/lib/dates";

export type ReportDateRange = {
  from: Date;
  to: Date;
  fromInput: string;
  toInput: string;
};

/** Fin del día UTC inclusive para el “hasta”. */
function endOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

/** Por defecto: mes calendario en curso (UTC). */
export function defaultReportDateRange(now = new Date()): ReportDateRange {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = endOfUtcDay(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  );
  return {
    from,
    to,
    fromInput: toDateInputValue(from),
    toInput: toDateInputValue(to),
  };
}

export function resolveReportDateRange(
  desde?: string | null,
  hasta?: string | null,
): ReportDateRange {
  const fallback = defaultReportDateRange();
  const fromParsed = desde ? parseDateInput(desde) : null;
  const toParsed = hasta ? parseDateInput(hasta) : null;

  let from = fromParsed ? startOfUtcDay(fromParsed) : fallback.from;
  let to = toParsed ? endOfUtcDay(toParsed) : fallback.to;

  if (from.getTime() > to.getTime()) {
    const swapFrom = startOfUtcDay(to);
    const swapTo = endOfUtcDay(from);
    from = swapFrom;
    to = swapTo;
  }

  return {
    from,
    to,
    fromInput: toDateInputValue(from),
    toInput: toDateInputValue(to),
  };
}
