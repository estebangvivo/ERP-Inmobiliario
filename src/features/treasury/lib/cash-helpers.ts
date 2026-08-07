import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/** Asegura que existan caja diaria y caja tesorería para la moneda. */
export async function ensureCashRegisters(
  organizationId: string,
  currency = "ARS",
  db: Db = prisma,
) {
  const code = currency.toUpperCase();

  const daily = await db.cashRegister.upsert({
    where: {
      organizationId_type_currency: {
        organizationId,
        type: "DAILY",
        currency: code,
      },
    },
    create: {
      organizationId,
      type: "DAILY",
      name: `Caja diaria (${code})`,
      currency: code,
      balance: 0,
    },
    update: {},
  });

  const treasury = await db.cashRegister.upsert({
    where: {
      organizationId_type_currency: {
        organizationId,
        type: "TREASURY",
        currency: code,
      },
    },
    create: {
      organizationId,
      type: "TREASURY",
      name: `Caja tesorería (${code})`,
      currency: code,
      balance: 0,
    },
    update: {},
  });

  return { daily, treasury };
}

export async function nextCashSessionNumber(
  organizationId: string,
  year = new Date().getFullYear(),
) {
  const prefix = `CAJA-${year}-`;
  const last = await prisma.cashSession.findFirst({
    where: {
      organizationId,
      number: { startsWith: prefix },
    },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = last ? Number(last.number.replace(prefix, "")) + 1 : 1;
  const safe = Number.isFinite(seq) && seq > 0 ? seq : 1;
  return `${prefix}${String(safe).padStart(4, "0")}`;
}

export function toNumber(value: { toNumber(): number } | number): number {
  return typeof value === "number" ? value : value.toNumber();
}
