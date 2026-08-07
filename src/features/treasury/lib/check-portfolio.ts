import { Prisma, type TreasuryPaymentMethod } from "@prisma/client";

type Tx = Prisma.TransactionClient;

function toNumber(value: { toNumber(): number } | number | Prisma.Decimal): number {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return value.toNumber();
  }
  return Number(value);
}

/** Al imputar un recibo, ingresa a cartera los cheques de sus pagos. */
export async function ingestChecksFromPostedReceipt(
  tx: Tx,
  input: {
    organizationId: string;
    receiptId: string;
    currency: string;
    drawerName: string | null;
    payments: {
      method: TreasuryPaymentMethod;
      amount: Prisma.Decimal | number;
      checkNumber: string | null;
      checkBank: string | null;
      checkIssueDate: Date | null;
      checkDueDate: Date | null;
      checkAccount: string | null;
      isElectronicCheck?: boolean;
    }[];
  },
) {
  for (const payment of input.payments) {
    if (payment.method !== "CHECK") continue;
    const number = payment.checkNumber?.trim();
    const bank = payment.checkBank?.trim();
    if (!number || !bank) {
      throw new Error("Cheque sin número o banco en el recibo.");
    }
    const isElectronic = Boolean(payment.isElectronicCheck);

    const existing = await tx.checkInstrument.findUnique({
      where: {
        organizationId_bank_number: {
          organizationId: input.organizationId,
          bank,
          number,
        },
      },
    });
    if (existing && existing.status !== "CANCELLED") {
      throw new Error(
        `El cheque ${number} del banco ${bank} ya está en cartera o fue entregado.`,
      );
    }

    if (existing?.status === "CANCELLED") {
      await tx.checkInstrument.update({
        where: { id: existing.id },
        data: {
          amount: payment.amount,
          currency: input.currency,
          issueDate: payment.checkIssueDate,
          dueDate: payment.checkDueDate,
          account: payment.checkAccount,
          drawerName: input.drawerName,
          isElectronic,
          status: "IN_PORTFOLIO",
          receiptId: input.receiptId,
          paymentOrderId: null,
        },
      });
      continue;
    }

    await tx.checkInstrument.create({
      data: {
        organizationId: input.organizationId,
        kind: "THIRD_PARTY",
        number,
        bank,
        isElectronic,
        amount: payment.amount,
        currency: input.currency,
        issueDate: payment.checkIssueDate,
        dueDate: payment.checkDueDate,
        account: payment.checkAccount,
        drawerName: input.drawerName,
        status: "IN_PORTFOLIO",
        receiptId: input.receiptId,
      },
    });
  }
}

/** Al anular un recibo imputado, cancela cheques que sigan en cartera. */
export async function cancelChecksFromReceipt(
  tx: Tx,
  organizationId: string,
  receiptId: string,
) {
  const checks = await tx.checkInstrument.findMany({
    where: { organizationId, receiptId },
  });
  for (const check of checks) {
    if (check.status === "DELIVERED") {
      throw new Error(
        `No se puede anular: el cheque ${check.number} (${check.bank}) ya fue entregado en una orden de pago.`,
      );
    }
    if (check.status === "DEPOSITED") {
      throw new Error(
        `No se puede anular: el cheque ${check.number} (${check.bank}) ya fue depositado en el banco.`,
      );
    }
    if (check.status === "BOUNCED") {
      throw new Error(
        `No se puede anular: el cheque ${check.number} (${check.bank}) figura como rechazado.`,
      );
    }
    await tx.checkInstrument.update({
      where: { id: check.id },
      data: { status: "CANCELLED" },
    });
  }
}

/**
 * Al imputar una OP, marca como entregados los cheques de cartera
 * o emite cheques propios (sin debitar banco aún).
 */
export async function deliverChecksFromPostedPaymentOrder(
  tx: Tx,
  input: {
    organizationId: string;
    paymentOrderId: string;
    currency: string;
    payments: {
      id?: string;
      method: TreasuryPaymentMethod;
      amount: Prisma.Decimal | number;
      checkInstrumentId: string | null;
      isOwnCheck?: boolean;
      bankAccountId?: string | null;
      checkNumber?: string | null;
      checkBank?: string | null;
      checkIssueDate?: Date | null;
      checkDueDate?: Date | null;
      checkAccount?: string | null;
      isElectronicCheck?: boolean;
    }[];
  },
) {
  for (const payment of input.payments) {
    if (payment.method !== "CHECK") continue;

    if (payment.isOwnCheck) {
      const number = payment.checkNumber?.trim();
      const bank = payment.checkBank?.trim();
      const issuedFromBankAccountId = payment.bankAccountId;
      const isElectronic = Boolean(payment.isElectronicCheck);
      if (!number || !bank) {
        throw new Error("Cheque propio sin número o banco.");
      }
      if (!issuedFromBankAccountId) {
        throw new Error("Cheque propio sin cuenta emisora.");
      }
      if (!payment.checkDueDate) {
        throw new Error("Cheque propio sin fecha de vencimiento.");
      }

      const account = await tx.bankAccount.findFirst({
        where: {
          id: issuedFromBankAccountId,
          organizationId: input.organizationId,
          isActive: true,
        },
      });
      if (!account) throw new Error("Cuenta emisora no encontrada.");
      if (
        account.currency.toUpperCase() !== input.currency.toUpperCase()
      ) {
        throw new Error(
          `La cuenta emisora opera en ${account.currency}, la OP está en ${input.currency}.`,
        );
      }

      const existing = await tx.checkInstrument.findUnique({
        where: {
          organizationId_bank_number: {
            organizationId: input.organizationId,
            bank,
            number,
          },
        },
      });
      if (existing && existing.status !== "CANCELLED") {
        throw new Error(
          `Ya existe el cheque ${number} del banco ${bank}.`,
        );
      }

      const created = existing
        ? await tx.checkInstrument.update({
            where: { id: existing.id },
            data: {
              kind: "OWN",
              amount: payment.amount,
              currency: input.currency,
              issueDate: payment.checkIssueDate,
              dueDate: payment.checkDueDate,
              account: payment.checkAccount,
              isElectronic,
              status: "DELIVERED",
              paymentOrderId: input.paymentOrderId,
              issuedFromBankAccountId,
              receiptId: null,
              drawerName: null,
              depositedBankAccountId: null,
              depositedAt: null,
            },
          })
        : await tx.checkInstrument.create({
            data: {
              organizationId: input.organizationId,
              kind: "OWN",
              number,
              bank,
              isElectronic,
              amount: payment.amount,
              currency: input.currency,
              issueDate: payment.checkIssueDate,
              dueDate: payment.checkDueDate,
              account: payment.checkAccount,
              status: "DELIVERED",
              paymentOrderId: input.paymentOrderId,
              issuedFromBankAccountId,
            },
          });

      if (payment.id) {
        await tx.paymentOrderPayment.update({
          where: { id: payment.id },
          data: { checkInstrumentId: created.id },
        });
      }
      continue;
    }

    if (!payment.checkInstrumentId) {
      throw new Error(
        "En órdenes de pago, los cheques deben elegirse de la cartera o emitirse como propios.",
      );
    }

    const check = await tx.checkInstrument.findFirst({
      where: {
        id: payment.checkInstrumentId,
        organizationId: input.organizationId,
        kind: "THIRD_PARTY",
      },
    });
    if (!check) throw new Error("Cheque de cartera no encontrado.");
    if (check.status !== "IN_PORTFOLIO") {
      throw new Error(
        `El cheque ${check.number} (${check.bank}) no está disponible en cartera.`,
      );
    }

    const payAmount = toNumber(payment.amount);
    const checkAmount = toNumber(check.amount);
    if (Math.abs(payAmount - checkAmount) > 0.009) {
      throw new Error(
        `El monto del pago con cheque ${check.number} debe ser ${checkAmount.toFixed(2)}.`,
      );
    }

    await tx.checkInstrument.update({
      where: { id: check.id },
      data: {
        status: "DELIVERED",
        paymentOrderId: input.paymentOrderId,
      },
    });
  }
}

/** Al anular una OP, devuelve cheques de terceros a cartera y anula propios no debitados. */
export async function returnChecksFromPaymentOrder(
  tx: Tx,
  organizationId: string,
  paymentOrderId: string,
) {
  const checks = await tx.checkInstrument.findMany({
    where: { organizationId, paymentOrderId },
  });

  for (const check of checks) {
    if (check.kind === "OWN") {
      if (check.status === "DEPOSITED") {
        throw new Error(
          `No se puede anular: el cheque propio ${check.number} ya fue debitado del banco.`,
        );
      }
      await tx.checkInstrument.update({
        where: { id: check.id },
        data: {
          status: "CANCELLED",
          paymentOrderId: null,
        },
      });
      continue;
    }

    if (check.status === "DELIVERED") {
      await tx.checkInstrument.update({
        where: { id: check.id },
        data: {
          status: "IN_PORTFOLIO",
          paymentOrderId: null,
        },
      });
    }
  }
}

/**
 * Repara cheques faltantes de recibos ya imputados
 * (p. ej. documentos posteados antes de existir la cartera).
 */
export async function backfillMissingChecksFromPostedReceipts(
  tx: Tx,
  organizationId: string,
): Promise<number> {
  const receipts = await tx.receipt.findMany({
    where: { organizationId, status: "POSTED" },
    include: {
      payments: true,
      checks: { select: { id: true } },
      tenant: { select: { name: true } },
    },
  });

  let created = 0;
  for (const receipt of receipts) {
    const payments =
      receipt.payments.length > 0
        ? receipt.payments
        : receipt.paymentMethod === "CHECK"
          ? [
              {
                method: "CHECK" as const,
                amount: receipt.totalAmount,
                checkNumber: receipt.checkNumber,
                checkBank: receipt.checkBank,
                checkIssueDate: receipt.checkIssueDate,
                checkDueDate: receipt.checkDueDate,
                checkAccount: receipt.checkAccount,
              },
            ]
          : [];

    const checkPayments = payments.filter((p) => p.method === "CHECK");
    if (checkPayments.length === 0) continue;
    if (receipt.checks.length >= checkPayments.length) continue;

    const before = await tx.checkInstrument.count({
      where: { organizationId, receiptId: receipt.id },
    });

    try {
      await ingestChecksFromPostedReceipt(tx, {
        organizationId,
        receiptId: receipt.id,
        currency: receipt.currency,
        drawerName: receipt.tenant?.name ?? receipt.partyName,
        payments: checkPayments,
      });
    } catch (error) {
      // Si ya existe por banco+número, no abortar el resto.
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("ya está en cartera")) throw error;
    }

    const after = await tx.checkInstrument.count({
      where: { organizationId, receiptId: receipt.id },
    });
    created += Math.max(0, after - before);
  }

  return created;
}
