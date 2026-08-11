import type { Currency, OperationType } from "@prisma/client";
import { formatMoney } from "@/lib/money";

type PriceLike = { toString(): string } | string | number | null | undefined;

function toNumber(value: PriceLike): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** En RENT el alquiler está en `price`/`currency`. En SALE/BOTH la venta está ahí. */
export function resolvePropertyPrices(p: {
  operationType: OperationType;
  price: PriceLike;
  rentPrice?: PriceLike;
  currency?: Currency | null;
  rentCurrency?: Currency | null;
}) {
  const main = toNumber(p.price);
  const extraRent = toNumber(p.rentPrice);
  const sale = p.operationType === "SALE" || p.operationType === "BOTH" ? main : null;
  const rent =
    p.operationType === "RENT"
      ? main
      : p.operationType === "BOTH"
        ? extraRent
        : null;
  const saleCurrency = p.currency ?? "ARS";
  const rentCurrency =
    p.operationType === "RENT"
      ? saleCurrency
      : (p.rentCurrency ?? "ARS");
  return { sale, rent, saleCurrency, rentCurrency };
}

export function formatPropertyPrices(p: {
  operationType: OperationType;
  price: PriceLike;
  rentPrice?: PriceLike;
  currency: Currency;
  rentCurrency?: Currency | null;
}) {
  const { sale, rent, saleCurrency, rentCurrency } = resolvePropertyPrices(p);
  if (sale != null && rent != null) {
    return `Alq. ${formatMoney(rent, rentCurrency)} · Venta ${formatMoney(sale, saleCurrency)}`;
  }
  if (sale != null) return formatMoney(sale, saleCurrency);
  if (rent != null) return formatMoney(rent, rentCurrency);
  return "—";
}
