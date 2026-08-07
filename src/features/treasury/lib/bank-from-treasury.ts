import type { Prisma } from "@prisma/client";
import { round2 } from "@/features/treasury/lib/cash-labels";

type Tx = Prisma.TransactionClient;

function toNumber(value: { toNumber(): number } | number | Prisma.Decimal): number {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return value.toNumber();
  }
  return Number(value);
}

/** Registra un movimiento bancario y actualiza el saldo de la cuenta. */
export async function postBankMovement(
  tx: Tx,
  input: {
    organizationId: string;
    bankAccountId: string;
    amount: number;
    kind: "INCOME" | "EXPENSE" | "OPENING" | "ADJUSTMENT" | "DEPOSIT" | "WITHDRAWAL" | "BOUNCE";
    description: string;
    currency?: string;
    receiptId?: string;
    paymentOrderId?: string;
    checkInstrumentId?: string;
    createdById?: string | null;
    occurredAt?: Date;
  },
) {
  const abs = round2(Math.abs(input.amount));
  if (abs <= 0 && input.kind !== "OPENING") return;

  const account = await tx.bankAccount.findFirst({
    where: {
      id: input.bankAccountId,
      organizationId: input.organizationId,
      isActive: true,
    },
  });
  if (!account) {
    throw new Error("Cuenta bancaria no encontrada o inactiva.");
  }

  if (
    input.currency &&
    account.currency.toUpperCase() !== input.currency.toUpperCase()
  ) {
    throw new Error(
      `La cuenta ${account.name} opera en ${account.currency}, no en ${input.currency}.`,
    );
  }

  const signed =
    input.kind === "EXPENSE" ||
    input.kind === "WITHDRAWAL" ||
    input.kind === "BOUNCE"
      ? -abs
      : input.kind === "INCOME" ||
          input.kind === "OPENING" ||
          input.kind === "DEPOSIT"
        ? abs
        : round2(input.amount);

  const balanceAfter = round2(toNumber(account.balance) + signed);

  await tx.bankMovement.create({
    data: {
      organizationId: input.organizationId,
      bankAccountId: account.id,
      type: input.kind,
      amount: signed,
      balanceAfter,
      description: input.description,
      receiptId: input.receiptId ?? null,
      paymentOrderId: input.paymentOrderId ?? null,
      checkInstrumentId: input.checkInstrumentId ?? null,
      createdById: input.createdById ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });

  await tx.bankAccount.update({
    where: { id: account.id },
    data: { balance: balanceAfter },
  });
}

/**
 * Al imputar un recibo/OP, registra transferencias en las cuentas elegidas.
 */
export async function postBankMovementsFromTreasuryDoc(
  tx: Tx,
  input: {
    organizationId: string;
    currency: string;
    kind: "INCOME" | "EXPENSE";
    description: string;
    receiptId?: string;
    paymentOrderId?: string;
    createdById?: string | null;
    payments: {
      method: string;
      amount: { toNumber(): number } | number | Prisma.Decimal;
      bankAccountId: string | null;
    }[];
  },
) {
  for (const payment of input.payments) {
    if (payment.method !== "TRANSFER") continue;
    if (!payment.bankAccountId) {
      throw new Error(
        "En transferencias debés elegir la cuenta bancaria.",
      );
    }
    await postBankMovement(tx, {
      organizationId: input.organizationId,
      bankAccountId: payment.bankAccountId,
      amount: toNumber(payment.amount),
      kind: input.kind,
      description: input.description,
      currency: input.currency,
      receiptId: input.receiptId,
      paymentOrderId: input.paymentOrderId,
      createdById: input.createdById,
    });
  }
}

/** Revierte movimientos bancarios ligados a un recibo/OP (al anular). */
export async function reverseBankMovementsForTreasuryDoc(
  tx: Tx,
  input: {
    organizationId: string;
    receiptId?: string;
    paymentOrderId?: string;
    createdById?: string | null;
  },
) {
  const where =
    input.receiptId != null
      ? { organizationId: input.organizationId, receiptId: input.receiptId }
      : input.paymentOrderId != null
        ? {
            organizationId: input.organizationId,
            paymentOrderId: input.paymentOrderId,
          }
        : null;

  if (!where) return;

  const movements = await tx.bankMovement.findMany({
    where: {
      ...where,
      type: { in: ["INCOME", "EXPENSE"] },
    },
  });

  for (const mov of movements) {
    await postBankMovement(tx, {
      organizationId: input.organizationId,
      bankAccountId: mov.bankAccountId,
      amount: -toNumber(mov.amount),
      kind: "ADJUSTMENT",
      description: `Anulación · ${mov.description}`,
      receiptId: mov.receiptId ?? undefined,
      paymentOrderId: mov.paymentOrderId ?? undefined,
      createdById: input.createdById,
    });
  }
}
