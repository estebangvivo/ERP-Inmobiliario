import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export function toNumber(
  value: { toNumber(): number } | number | Prisma.Decimal,
): number {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return value.toNumber();
  }
  return Number(value);
}

export function sumAmounts(lines: { amount: number }[]): Prisma.Decimal {
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  return new Prisma.Decimal(Math.round(total * 100) / 100);
}

/** Siguiente número REC-YYYY-NNNN / OP-YYYY-NNNN por organización. */
export async function nextTreasuryNumber(
  organizationId: string,
  prefix: "REC" | "OP",
  tx: Tx = prisma,
): Promise<string> {
  const year = new Date().getFullYear();
  const head = `${prefix}-${year}-`;

  if (prefix === "REC") {
    const last = await tx.receipt.findFirst({
      where: { organizationId, number: { startsWith: head } },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const seq = last ? Number(last.number.slice(head.length)) + 1 : 1;
    return `${head}${String(seq).padStart(4, "0")}`;
  }

  const last = await tx.paymentOrder.findFirst({
    where: { organizationId, number: { startsWith: head } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = last ? Number(last.number.slice(head.length)) + 1 : 1;
  return `${head}${String(seq).padStart(4, "0")}`;
}

/** No-op: en inmobiliario no hay BudgetItem de obra. */
export async function syncBudgetItemsFromTreasury(
  _tx: Tx,
  _organizationId: string,
  _ids: (string | null | undefined)[],
) {
  return;
}
