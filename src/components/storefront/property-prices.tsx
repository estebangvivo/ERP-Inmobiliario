import type { Currency, OperationType } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { resolvePropertyPrices } from "@/lib/property-prices";

type Props = {
  operationType: OperationType;
  price: { toString(): string } | string | number;
  rentPrice?: { toString(): string } | string | number | null;
  currency: Currency;
  rentCurrency?: Currency | null;
  size?: "card" | "detail";
};

export function PropertyCardPrices({
  operationType,
  price,
  rentPrice,
  currency,
  rentCurrency,
  size = "card",
}: Props) {
  const { sale, rent, saleCurrency, rentCurrency: rentCur } = resolvePropertyPrices({
    operationType,
    price,
    rentPrice,
    currency,
    rentCurrency,
  });
  const titleClass =
    size === "detail"
      ? "text-3xl font-semibold text-[var(--primary)]"
      : "text-lg font-semibold text-[var(--primary)]";
  const labelClass =
    size === "detail"
      ? "text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]"
      : "text-xs text-[var(--muted-foreground)]";

  if (sale != null && rent != null) {
    return (
      <div className={size === "detail" ? "space-y-3" : "space-y-1"}>
        <div>
          <p className={labelClass}>Alquiler</p>
          <p className={titleClass}>{formatMoney(rent, rentCur)}</p>
        </div>
        <div>
          <p className={labelClass}>Venta</p>
          <p className={titleClass}>{formatMoney(sale, saleCurrency)}</p>
        </div>
      </div>
    );
  }

  const only = sale ?? rent;
  return (
    <p className={titleClass}>
      {only != null
        ? formatMoney(only, sale != null ? saleCurrency : rentCur)
        : "—"}
    </p>
  );
}
