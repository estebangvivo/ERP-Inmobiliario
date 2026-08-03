/** Monedas soportadas. Recomendadas: ARS y USD (nunca CLP). */
export const APP_CURRENCIES = [
  { code: "ARS", label: "Peso argentino (ARS)", primary: true },
  { code: "USD", label: "Dólar estadounidense (USD)", primary: true },
  { code: "EUR", label: "Euro (EUR)", primary: false },
  { code: "UYU", label: "Peso uruguayo (UYU)", primary: false },
  { code: "BRL", label: "Real brasileño (BRL)", primary: false },
] as const;

export type AppCurrencyCode = (typeof APP_CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: AppCurrencyCode = "ARS";
export const DEFAULT_ENABLED_CURRENCIES: AppCurrencyCode[] = ["ARS", "USD"];

export function isAppCurrency(value: string): value is AppCurrencyCode {
  return APP_CURRENCIES.some((c) => c.code === value);
}

export function normalizeCurrency(value: string | null | undefined): string {
  const code = value?.trim().toUpperCase();
  if (code && isAppCurrency(code)) return code;
  return DEFAULT_CURRENCY;
}

export function normalizeEnabledCurrencies(
  values: string[] | null | undefined,
  primary?: string,
): string[] {
  const set = new Set<string>();
  for (const raw of values ?? []) {
    const code = normalizeCurrency(raw);
    if (isAppCurrency(code)) set.add(code);
  }
  set.add("ARS");
  set.add("USD");
  set.add(normalizeCurrency(primary));

  const preferred = ["ARS", "USD"];
  return [
    ...preferred.filter((c) => set.has(c)),
    ...[...set].filter((c) => !preferred.includes(c)).sort(),
  ];
}

export function parseEnabledCurrenciesField(
  value: FormDataEntryValue | null,
): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [...DEFAULT_ENABLED_CURRENCIES];
  }
  return normalizeEnabledCurrencies(
    value.split(",").map((s) => s.trim()).filter(Boolean),
  );
}

/** Agrupa montos por moneda (no mezcla). */
export function sumByCurrency(
  items: { currency: string; amount: number }[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const code = normalizeCurrency(item.currency);
    totals[code] = (totals[code] ?? 0) + (Number(item.amount) || 0);
  }
  return totals;
}

export function formatMoneyByCurrency(
  totals: Record<string, number>,
  empty = "$ 0,00",
): string {
  const entries = Object.entries(totals).filter(([, v]) => v !== 0);
  if (entries.length === 0) return empty;
  return entries
    .map(([currency, amount]) => {
      const code = normalizeCurrency(currency);
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 2,
      }).format(amount);
    })
    .join(" · ");
}
