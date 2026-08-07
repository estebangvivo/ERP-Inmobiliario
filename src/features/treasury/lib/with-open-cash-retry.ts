"use client";

import { openDailyCashSession } from "@/features/treasury/actions/cash-actions";

type CashGateResult = {
  ok: boolean;
  error?: string;
  code?: "NO_OPEN_CASH";
  currency?: string;
};

/**
 * Si falla por caja cerrada, ofrece abrirla (fondo 0) y reintenta la acción.
 */
export async function withOpenCashRetry<T extends CashGateResult>(
  attempt: () => Promise<T>,
): Promise<T> {
  const first = await attempt();
  if (first.ok || first.code !== "NO_OPEN_CASH") return first;

  const currency = first.currency ?? "ARS";
  const accept = window.confirm(
    `No hay caja diaria abierta en ${currency}.\n\n¿Abrirla ahora con fondo $0 e imputar?`,
  );
  if (!accept) return first;

  const opened = await openDailyCashSession({
    currency,
    openingBalance: 0,
  });
  if (!opened.ok) {
    return {
      ...first,
      ok: false,
      error: opened.error,
      code: undefined,
      currency: undefined,
    };
  }

  return attempt();
}
