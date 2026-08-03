import { Currency } from "@prisma/client";

const formatters: Record<Currency, Intl.NumberFormat> = {
  ARS: new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }),
  EUR: new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }),
};

export function formatMoney(
  amount: number | string,
  currency: Currency = Currency.ARS,
): string {
  return formatters[currency].format(Number(amount));
}
