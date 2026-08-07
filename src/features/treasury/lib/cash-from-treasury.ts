import type { Prisma } from "@prisma/client";
import { toNumber } from "@/features/treasury/lib/cash-helpers";
import { round2 } from "@/features/treasury/lib/cash-labels";

type Tx = Prisma.TransactionClient;

export class NoOpenCashError extends Error {
  readonly code = "NO_OPEN_CASH" as const;
  readonly currency: string;

  constructor(currency: string) {
    const c = (currency || "ARS").toUpperCase();
    super(
      `No hay caja diaria abierta en ${c}. Abrí la caja en Tesorería → Caja antes de imputar efectivo.`,
    );
    this.name = "NoOpenCashError";
    this.currency = c;
  }
}

/**
 * Al imputar un recibo/OP en efectivo, registra el movimiento en la caja diaria
 * abierta de la misma moneda. Exige sesión OPEN.
 */
export async function postCashMovementFromTreasuryDoc(
  tx: Tx,
  input: {
    organizationId: string;
    currency: string;
    amount: number;
    kind: "INCOME" | "EXPENSE";
    description: string;
    receiptId?: string;
    paymentOrderId?: string;
    createdById?: string | null;
  },
) {
  const abs = round2(Math.abs(input.amount));
  if (abs <= 0) return;

  const currency = (input.currency || "ARS").toUpperCase();

  const openSession = await tx.cashSession.findFirst({
    where: {
      organizationId: input.organizationId,
      status: "OPEN",
      currency,
      register: { type: "DAILY", currency },
    },
  });

  if (!openSession) {
    throw new NoOpenCashError(currency);
  }

  const signed = input.kind === "INCOME" ? abs : -abs;
  const register = await tx.cashRegister.findUniqueOrThrow({
    where: { id: openSession.registerId },
  });
  const balanceAfter = round2(toNumber(register.balance) + signed);

  await tx.cashMovement.create({
    data: {
      organizationId: input.organizationId,
      registerId: openSession.registerId,
      sessionId: openSession.id,
      type: input.kind,
      amount: signed,
      balanceAfter,
      description: input.description,
      receiptId: input.receiptId ?? null,
      paymentOrderId: input.paymentOrderId ?? null,
      createdById: input.createdById ?? null,
    },
  });

  await tx.cashRegister.update({
    where: { id: openSession.registerId },
    data: { balance: balanceAfter },
  });
}

/** Revierte movimientos de caja ligados a un recibo/OP (al anular). */
export async function reverseCashMovementsForTreasuryDoc(
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

  const movements = await tx.cashMovement.findMany({
    where: {
      ...where,
      type: { in: ["INCOME", "EXPENSE"] },
    },
  });

  if (movements.length === 0) return;

  for (const mov of movements) {
    const register = await tx.cashRegister.findUniqueOrThrow({
      where: { id: mov.registerId },
    });
    const reverseAmount = -toNumber(mov.amount);
    const balanceAfter = round2(toNumber(register.balance) + reverseAmount);

    await tx.cashMovement.create({
      data: {
        organizationId: input.organizationId,
        registerId: mov.registerId,
        sessionId: mov.sessionId,
        type: "ADJUSTMENT",
        amount: reverseAmount,
        balanceAfter,
        description: `Anulación · ${mov.description}`,
        receiptId: mov.receiptId,
        paymentOrderId: mov.paymentOrderId,
        createdById: input.createdById ?? null,
      },
    });
    await tx.cashRegister.update({
      where: { id: mov.registerId },
      data: { balance: balanceAfter },
    });
  }
}
