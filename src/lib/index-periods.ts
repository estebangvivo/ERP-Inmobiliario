/** Duraciones de período para carga de índices IPC/ICL/CP. */
export const INDEX_PERIOD_OPTIONS = [2, 3, 4, 6, 9, 12] as const;

export type IndexPeriodMonths = (typeof INDEX_PERIOD_OPTIONS)[number];

export function indexRateKey(
  year: number,
  month: number,
  periodMonths: number,
) {
  return `${year}-${month}-${periodMonths}`;
}
