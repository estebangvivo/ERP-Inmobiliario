"use server";

import { revalidatePath } from "next/cache";
import { parseDateInput } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import type { TreasuryPaymentMethod } from "@prisma/client";
import {
  nextTreasuryNumber,
  sumAmounts,
  syncBudgetItemsFromTreasury,
} from "@/features/treasury/lib/helpers";
import {
  NoOpenCashError,
  postCashMovementFromTreasuryDoc,
  reverseCashMovementsForTreasuryDoc,
} from "@/features/treasury/lib/cash-from-treasury";
import {
  postBankMovementsFromTreasuryDoc,
  reverseBankMovementsForTreasuryDoc,
} from "@/features/treasury/lib/bank-from-treasury";
import { getOrganizationCurrency } from "@/features/settings/queries/get-organization";
import { toNumber } from "@/features/treasury/lib/cash-helpers";
import {
  cancelChecksFromReceipt,
  deliverChecksFromPostedPaymentOrder,
  ingestChecksFromPostedReceipt,
  returnChecksFromPaymentOrder,
} from "@/features/treasury/lib/check-portfolio";
import {
  applyPaymentOrderInvoiceBalances,
  applyPaymentOrderSettlementBalances,
  applyReceiptBillBalances,
  replacePaymentOrderInvoiceApps,
  replacePaymentOrderSettlementApps,
  replaceReceiptBillApps,
  validateApplicationsSum,
  type DocumentApplicationInput,
} from "@/features/treasury/lib/document-applications";
import {
  cashAmountFromPayments,
  paymentCreateData,
  primaryPaymentMethod,
  validatePaymentsAgainstTotal,
  type TreasuryPaymentInput,
} from "@/features/treasury/lib/payments";
import { normalizeCheckNumber } from "@/features/treasury/lib/check-number";

export type TreasuryLineInput = {
  contractId?: string;
  propertyId?: string;
  description: string;
  amount: number;
};

export type CheckDetailsInput = {
  checkNumber?: string;
  checkBank?: string;
  checkIssueDate?: string;
  checkDueDate?: string;
  checkAccount?: string;
};

export type CreateReceiptInput = {
  issueDate: string;
  tenantId?: string;
  partyName?: string;
  concept?: string;
  paymentMethod?: TreasuryPaymentMethod;
  currency?: string;
  notes?: string;
  check?: CheckDetailsInput;
  lines: TreasuryLineInput[];
  payments?: TreasuryPaymentInput[];
  billApps?: DocumentApplicationInput[];
};

export type CreatePaymentOrderInput = {
  issueDate: string;
  supplierId?: string;
  partyName?: string;
  concept?: string;
  paymentMethod?: TreasuryPaymentMethod;
  currency?: string;
  notes?: string;
  check?: CheckDetailsInput;
  lines: TreasuryLineInput[];
  payments?: TreasuryPaymentInput[];
  invoiceApps?: DocumentApplicationInput[];
  settlementApps?: DocumentApplicationInput[];
};

export type ActionResult =
  | {
      ok: true;
      id: string;
      number: string;
      postError?: string;
      postCode?: "NO_OPEN_CASH";
      postCurrency?: string;
    }
  | {
      ok: false;
      error: string;
      code?: "NO_OPEN_CASH";
      currency?: string;
    };

function canManage(role: string) {
  return ["ADMIN", "AGENT"].includes(role);
}

function failFromError(
  error: unknown,
  fallback: string,
): Extract<ActionResult, { ok: false }> {
  if (error instanceof NoOpenCashError) {
    return {
      ok: false,
      error: error.message,
      code: "NO_OPEN_CASH",
      currency: error.currency,
    };
  }
  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

function resolvePayments(
  input: {
    payments?: TreasuryPaymentInput[];
    paymentMethod?: TreasuryPaymentMethod;
    check?: CheckDetailsInput;
  },
  totalAmount: number,
): TreasuryPaymentInput[] {
  if (input.payments && input.payments.length > 0) {
    return input.payments.filter((p) => Number(p.amount) > 0);
  }
  const method = input.paymentMethod ?? "CASH";
  return [
    {
      method,
      amount: totalAmount,
      checkNumber: input.check?.checkNumber,
      checkBank: input.check?.checkBank,
      checkIssueDate: input.check?.checkIssueDate,
      checkDueDate: input.check?.checkDueDate,
      checkAccount: input.check?.checkAccount,
    },
  ];
}

function legacyCheckFromPayments(payments: TreasuryPaymentInput[]) {
  const check = payments.find((p) => p.method === "CHECK");
  if (!check) {
    return {
      checkNumber: null as string | null,
      checkBank: null as string | null,
      checkIssueDate: null as Date | null,
      checkDueDate: null as Date | null,
      checkAccount: null as string | null,
    };
  }
  const isElectronic = Boolean(check.isElectronicCheck);
  return {
    checkNumber:
      normalizeCheckNumber(check.checkNumber, isElectronic) || null,
    checkBank: check.checkBank?.trim() || null,
    checkIssueDate: check.checkIssueDate
      ? parseDateInput(check.checkIssueDate)
      : null,
    checkDueDate: check.checkDueDate
      ? parseDateInput(check.checkDueDate)
      : null,
    checkAccount: check.checkAccount?.trim() || null,
  };
}

function revalidateTreasury(doc?: {
  kind: "receipt" | "payment-order";
  id: string;
}) {
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/recibos");
  revalidatePath("/tesoreria/ordenes-pago");
  revalidatePath("/tesoreria/cheques");
  revalidatePath("/tesoreria/bancos");
  revalidatePath("/tesoreria/caja");
  revalidatePath("/tesoreria/caja/tesoreria");
  if (doc) {
    revalidatePath(
      doc.kind === "receipt"
        ? `/tesoreria/recibos/${doc.id}`
        : `/tesoreria/ordenes-pago/${doc.id}`,
    );
  }
}

async function assertContractsInOrg(
  organizationId: string,
  contractIds: string[],
) {
  const ids = [...new Set(contractIds.filter(Boolean))];
  if (ids.length === 0) return;
  const count = await prisma.contract.count({
    where: {
      id: { in: ids },
      organizationId,
    },
  });
  if (count !== ids.length) {
    throw new Error("Uno o más contratos no pertenecen a tu organización.");
  }
}

async function resolveLinePropertyIds(
  organizationId: string,
  lines: TreasuryLineInput[],
) {
  const contractIds = [...new Set(lines.map((l) => l.contractId).filter(Boolean))];
  const contracts = await prisma.contract.findMany({
    where: { id: { in: contractIds as string[] }, organizationId },
    select: { id: true, propertyId: true },
  });
  const byContract = new Map(contracts.map((c) => [c.id, c.propertyId]));
  return lines.map((line) => ({
    ...line,
    propertyId: line.propertyId || byContract.get(line.contractId ?? "") || null,
  }));
}

export async function createReceipt(
  input: CreateReceiptInput,
): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "No tienes permiso para emitir recibos." };
    }

    const lines = input.lines.filter(
      (l) => l.description.trim() && Number(l.amount) > 0,
    );
    if (lines.length === 0) {
      return { ok: false, error: "Agregá al menos una línea con monto." };
    }
    if (lines.some((l) => !l.contractId?.trim())) {
      return {
        ok: false,
        error: "Cada línea del recibo debe tener un contrato.",
      };
    }

    await assertContractsInOrg(
      session.organizationId,
      lines.map((l) => l.contractId ?? ""),
    );
    const resolvedLines = await resolveLinePropertyIds(
      session.organizationId,
      lines,
    );

    const totalAmount = Number(sumAmounts(lines).toString());
    const payments = resolvePayments(input, totalAmount);
    const paymentError = validatePaymentsAgainstTotal(payments, totalAmount);
    if (paymentError) return { ok: false, error: paymentError };

    const billApps = (input.billApps ?? [])
      .map((a) => ({
        documentId: a.documentId,
        amount: Number(a.amount) || 0,
      }))
      .filter((a) => a.amount > 0);
    const appsError = validateApplicationsSum(billApps, totalAmount, "cuotas");
    if (appsError) return { ok: false, error: appsError };

    const issueDate = parseDateInput(input.issueDate);
    if (!issueDate) {
      return { ok: false, error: "Fecha del recibo inválida." };
    }

    const currency =
      input.currency?.trim() || (await getOrganizationCurrency());
    const primaryMethod = primaryPaymentMethod(payments);
    const checkData = legacyCheckFromPayments(payments);

    const receipt = await prisma.$transaction(async (tx) => {
      const number = await nextTreasuryNumber(
        session.organizationId,
        "REC",
        tx,
      );
      const created = await tx.receipt.create({
        data: {
          organizationId: session.organizationId,
          createdById: session.user.id,
          tenantId: input.tenantId || null,
          partyName: input.partyName?.trim() || null,
          number,
          issueDate,
          status: "DRAFT",
          paymentMethod: primaryMethod,
          concept: input.concept?.trim() || null,
          currency,
          totalAmount,
          notes: input.notes?.trim() || null,
          ...checkData,
          lines: {
            create: resolvedLines.map((line, index) => ({
              contractId: line.contractId || null,
              propertyId: line.propertyId || null,
              description: line.description.trim(),
              amount: line.amount,
              sortOrder: index,
            })),
          },
          payments: {
            create: paymentCreateData(payments),
          },
        },
      });
      await replaceReceiptBillApps(tx, created.id, billApps);
      return created;
    });

    revalidateTreasury({ kind: "receipt", id: receipt.id });

    const posted = await postReceipt(receipt.id);
    if (!posted.ok) {
      return {
        ok: true,
        id: receipt.id,
        number: receipt.number,
        postError:
          posted.error ??
          "El recibo quedó en borrador: no se pudo imputar.",
        postCode: posted.code,
        postCurrency: posted.currency,
      };
    }

    return { ok: true, id: receipt.id, number: receipt.number };
  } catch (error) {
    console.error("createReceipt", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo crear el recibo.",
    };
  }
}

export async function createPaymentOrder(
  input: CreatePaymentOrderInput,
): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return {
        ok: false,
        error: "No tienes permiso para emitir órdenes de pago.",
      };
    }

    const lines = input.lines.filter(
      (l) => l.description.trim() && Number(l.amount) > 0,
    );
    if (lines.length === 0) {
      return { ok: false, error: "Agregá al menos una línea con monto." };
    }
    if (lines.some((l) => !l.contractId?.trim())) {
      return {
        ok: false,
        error: "Cada línea de la orden de pago debe tener un contrato.",
      };
    }

    await assertContractsInOrg(
      session.organizationId,
      lines.map((l) => l.contractId ?? ""),
    );
    const resolvedLines = await resolveLinePropertyIds(
      session.organizationId,
      lines,
    );

    const totalAmount = Number(sumAmounts(lines).toString());
    const payments = resolvePayments(input, totalAmount);
    const paymentError = validatePaymentsAgainstTotal(payments, totalAmount, {
      requirePortfolioChecks: true,
    });
    if (paymentError) return { ok: false, error: paymentError };

    const invoiceApps = (input.invoiceApps ?? [])
      .map((a) => ({
        documentId: a.documentId,
        amount: Number(a.amount) || 0,
      }))
      .filter((a) => a.amount > 0);
    const settlementApps = (input.settlementApps ?? [])
      .map((a) => ({
        documentId: a.documentId,
        amount: Number(a.amount) || 0,
      }))
      .filter((a) => a.amount > 0);
    const appsError =
      validateApplicationsSum(invoiceApps, totalAmount, "facturas") ??
      validateApplicationsSum(settlementApps, totalAmount, "rendiciones");
    if (appsError) return { ok: false, error: appsError };

    const issueDate = parseDateInput(input.issueDate);
    if (!issueDate) {
      return { ok: false, error: "Fecha de la orden inválida." };
    }

    const currency =
      input.currency?.trim() || (await getOrganizationCurrency());
    const primaryMethod = primaryPaymentMethod(payments);
    const checkData = legacyCheckFromPayments(payments);

    const order = await prisma.$transaction(async (tx) => {
      const number = await nextTreasuryNumber(session.organizationId, "OP", tx);

      const paymentRows = paymentCreateData(payments, {
        forPaymentOrder: true,
      });
      for (const row of paymentRows) {
        if (row.method !== "CHECK" || row.isOwnCheck || !row.checkInstrumentId)
          continue;
        const check = await tx.checkInstrument.findFirst({
          where: {
            id: row.checkInstrumentId,
            organizationId: session.organizationId,
            status: "IN_PORTFOLIO",
            kind: "THIRD_PARTY",
          },
        });
        if (!check) {
          throw new Error(
            "Uno de los cheques elegidos no está disponible en cartera.",
          );
        }
        const alreadyLinked = await tx.paymentOrderPayment.findFirst({
          where: {
            checkInstrumentId: check.id,
            paymentOrder: {
              organizationId: session.organizationId,
              status: { not: "CANCELLED" },
            },
          },
        });
        if (alreadyLinked) {
          throw new Error(
            `El cheque ${check.number} (${check.bank}) ya está usado en otra orden de pago.`,
          );
        }
        row.amount = toNumber(check.amount);
        row.checkNumber = check.number;
        row.checkBank = check.bank;
        row.checkIssueDate = check.issueDate;
        row.checkDueDate = check.dueDate;
        row.checkAccount = check.account;
      }

      const paymentsSum = paymentRows.reduce(
        (acc, p) => acc + Number(p.amount),
        0,
      );
      if (Math.abs(paymentsSum - totalAmount) > 0.009) {
        throw new Error(
          "La suma de medios (con montos de cheques de cartera) no coincide con el total de líneas.",
        );
      }

      const created = await tx.paymentOrder.create({
        data: {
          organizationId: session.organizationId,
          createdById: session.user.id,
          supplierId: input.supplierId || null,
          partyName: input.partyName?.trim() || null,
          number,
          issueDate,
          status: "DRAFT",
          paymentMethod: primaryMethod,
          concept: input.concept?.trim() || null,
          currency,
          totalAmount,
          notes: input.notes?.trim() || null,
          ...checkData,
          lines: {
            create: resolvedLines.map((line, index) => ({
              contractId: line.contractId || null,
              propertyId: line.propertyId || null,
              description: line.description.trim(),
              amount: line.amount,
              sortOrder: index,
            })),
          },
          payments: {
            create: paymentRows,
          },
        },
      });
      await replacePaymentOrderInvoiceApps(tx, created.id, invoiceApps);
      await replacePaymentOrderSettlementApps(tx, created.id, settlementApps);
      return created;
    });

    revalidateTreasury({ kind: "payment-order", id: order.id });

    const posted = await postPaymentOrder(order.id);
    if (!posted.ok) {
      return {
        ok: true,
        id: order.id,
        number: order.number,
        postError:
          posted.error ??
          "La orden quedó en borrador: no se pudo imputar.",
        postCode: posted.code,
        postCurrency: posted.currency,
      };
    }

    return { ok: true, id: order.id, number: order.number };
  } catch (error) {
    console.error("createPaymentOrder", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo crear la orden de pago.",
    };
  }
}

export async function issueReceipt(id: string): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const doc = await prisma.receipt.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!doc) return { ok: false, error: "Recibo no encontrado." };
    if (doc.status !== "DRAFT") {
      return { ok: false, error: "Solo se pueden emitir borradores." };
    }

    await prisma.receipt.update({
      where: { id },
      data: { status: "ISSUED" },
    });

    revalidateTreasury({ kind: "receipt", id });
    return { ok: true, id, number: doc.number };
  } catch (error) {
    console.error("issueReceipt", error);
    return { ok: false, error: "No se pudo emitir el recibo." };
  }
}

export async function postReceipt(id: string): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.receipt.findFirst({
        where: { id, organizationId: session.organizationId },
        include: {
          lines: true,
          payments: true,
          tenant: { select: { name: true } },
        },
      });
      if (!doc) throw new Error("Recibo no encontrado.");
      if (doc.status !== "DRAFT" && doc.status !== "ISSUED") {
        throw new Error("El recibo no se puede imputar en este estado.");
      }

      const cashAmount =
        doc.payments.length > 0
          ? cashAmountFromPayments(
              doc.payments.map((p) => ({
                method: p.method,
                amount: toNumber(p.amount),
              })),
            )
          : doc.paymentMethod === "CASH"
            ? toNumber(doc.totalAmount)
            : 0;

      if (cashAmount > 0) {
        await postCashMovementFromTreasuryDoc(tx, {
          organizationId: session.organizationId,
          currency: doc.currency,
          amount: cashAmount,
          kind: "INCOME",
          description: `Recibo ${doc.number}${
            doc.tenant?.name || doc.partyName
              ? ` · ${doc.tenant?.name ?? doc.partyName}`
              : ""
          }`,
          receiptId: doc.id,
          createdById: session.user.id,
        });
      }

      await ingestChecksFromPostedReceipt(tx, {
        organizationId: session.organizationId,
        receiptId: doc.id,
        currency: doc.currency,
        drawerName: doc.tenant?.name ?? doc.partyName,
        payments:
          doc.payments.length > 0
            ? doc.payments
            : doc.paymentMethod === "CHECK"
              ? [
                  {
                    method: "CHECK" as const,
                    amount: doc.totalAmount,
                    checkNumber: doc.checkNumber,
                    checkBank: doc.checkBank,
                    checkIssueDate: doc.checkIssueDate,
                    checkDueDate: doc.checkDueDate,
                    checkAccount: doc.checkAccount,
                  },
                ]
              : [],
      });

      await postBankMovementsFromTreasuryDoc(tx, {
        organizationId: session.organizationId,
        currency: doc.currency,
        kind: "INCOME",
        description: `Recibo ${doc.number}${
          doc.tenant?.name || doc.partyName
            ? ` · ${doc.tenant?.name ?? doc.partyName}`
            : ""
        }`,
        receiptId: doc.id,
        createdById: session.user.id,
        payments: doc.payments,
      });

      await tx.receipt.update({
        where: { id },
        data: { status: "POSTED", postedAt: new Date() },
      });

      await applyReceiptBillBalances(
        tx,
        session.organizationId,
        doc.id,
        1,
        {
          recordedById: session.user.id,
          paymentMethod: doc.paymentMethod,
        },
      );

      await syncBudgetItemsFromTreasury(tx, session.organizationId, []);

      return doc;
    });

    revalidateTreasury({ kind: "receipt", id });
    return { ok: true, id, number: result.number };
  } catch (error) {
    console.error("postReceipt", error);
    return failFromError(error, "No se pudo imputar el recibo.");
  }
}

export async function cancelReceipt(id: string): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.receipt.findFirst({
        where: { id, organizationId: session.organizationId },
        include: { lines: true },
      });
      if (!doc) throw new Error("Recibo no encontrado.");
      if (doc.status === "CANCELLED") {
        throw new Error("El recibo ya está anulado.");
      }

      if (doc.status === "POSTED") {
        await applyReceiptBillBalances(
          tx,
          session.organizationId,
          doc.id,
          -1,
          { paymentMethod: doc.paymentMethod },
        );
        await cancelChecksFromReceipt(tx, session.organizationId, doc.id);
        await reverseBankMovementsForTreasuryDoc(tx, {
          organizationId: session.organizationId,
          receiptId: doc.id,
          createdById: session.user.id,
        });
        const cashMovements = await tx.cashMovement.count({
          where: { receiptId: doc.id, type: { in: ["INCOME", "EXPENSE"] } },
        });
        if (cashMovements > 0) {
          await reverseCashMovementsForTreasuryDoc(tx, {
            organizationId: session.organizationId,
            receiptId: doc.id,
            createdById: session.user.id,
          });
        }
      }

      await tx.receipt.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });

      return doc;
    });

    revalidateTreasury({ kind: "receipt", id });
    return { ok: true, id, number: result.number };
  } catch (error) {
    console.error("cancelReceipt", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo anular el recibo.",
    };
  }
}

export async function issuePaymentOrder(id: string): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const doc = await prisma.paymentOrder.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!doc) return { ok: false, error: "Orden de pago no encontrada." };
    if (doc.status !== "DRAFT") {
      return { ok: false, error: "Solo se pueden emitir borradores." };
    }

    await prisma.paymentOrder.update({
      where: { id },
      data: { status: "ISSUED" },
    });

    revalidateTreasury({ kind: "payment-order", id });
    return { ok: true, id, number: doc.number };
  } catch (error) {
    console.error("issuePaymentOrder", error);
    return { ok: false, error: "No se pudo emitir la orden de pago." };
  }
}

export async function postPaymentOrder(id: string): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.paymentOrder.findFirst({
        where: { id, organizationId: session.organizationId },
        include: { lines: true, payments: true },
      });
      if (!doc) throw new Error("Orden de pago no encontrada.");
      if (doc.status !== "DRAFT" && doc.status !== "ISSUED") {
        throw new Error("La orden no se puede imputar en este estado.");
      }

      const cashAmount =
        doc.payments.length > 0
          ? cashAmountFromPayments(
              doc.payments.map((p) => ({
                method: p.method,
                amount: toNumber(p.amount),
              })),
            )
          : doc.paymentMethod === "CASH"
            ? toNumber(doc.totalAmount)
            : 0;

      if (cashAmount > 0) {
        await postCashMovementFromTreasuryDoc(tx, {
          organizationId: session.organizationId,
          currency: doc.currency,
          amount: cashAmount,
          kind: "EXPENSE",
          description: `OP ${doc.number}${doc.partyName ? ` · ${doc.partyName}` : ""}`,
          paymentOrderId: doc.id,
          createdById: session.user.id,
        });
      }

      await deliverChecksFromPostedPaymentOrder(tx, {
        organizationId: session.organizationId,
        paymentOrderId: doc.id,
        currency: doc.currency,
        payments: doc.payments.map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
          checkInstrumentId: p.checkInstrumentId,
          isOwnCheck: p.isOwnCheck,
          isElectronicCheck: p.isElectronicCheck,
          bankAccountId: p.bankAccountId,
          checkNumber: p.checkNumber,
          checkBank: p.checkBank,
          checkIssueDate: p.checkIssueDate,
          checkDueDate: p.checkDueDate,
          checkAccount: p.checkAccount,
        })),
      });

      await postBankMovementsFromTreasuryDoc(tx, {
        organizationId: session.organizationId,
        currency: doc.currency,
        kind: "EXPENSE",
        description: `OP ${doc.number}${doc.partyName ? ` · ${doc.partyName}` : ""}`,
        paymentOrderId: doc.id,
        createdById: session.user.id,
        payments: doc.payments,
      });

      await tx.paymentOrder.update({
        where: { id },
        data: { status: "POSTED", postedAt: new Date() },
      });

      await applyPaymentOrderInvoiceBalances(
        tx,
        session.organizationId,
        doc.id,
        1,
      );
      await applyPaymentOrderSettlementBalances(
        tx,
        session.organizationId,
        doc.id,
        1,
      );

      await syncBudgetItemsFromTreasury(tx, session.organizationId, []);

      return doc;
    });

    revalidateTreasury({ kind: "payment-order", id });
    return { ok: true, id, number: result.number };
  } catch (error) {
    console.error("postPaymentOrder", error);
    return failFromError(error, "No se pudo imputar la orden de pago.");
  }
}

export async function cancelPaymentOrder(id: string): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.paymentOrder.findFirst({
        where: { id, organizationId: session.organizationId },
        include: { lines: true },
      });
      if (!doc) throw new Error("Orden de pago no encontrada.");
      if (doc.status === "CANCELLED") {
        throw new Error("La orden ya está anulada.");
      }

      if (doc.status === "POSTED") {
        await applyPaymentOrderInvoiceBalances(
          tx,
          session.organizationId,
          doc.id,
          -1,
        );
        await applyPaymentOrderSettlementBalances(
          tx,
          session.organizationId,
          doc.id,
          -1,
        );
        await returnChecksFromPaymentOrder(tx, session.organizationId, doc.id);
        await reverseBankMovementsForTreasuryDoc(tx, {
          organizationId: session.organizationId,
          paymentOrderId: doc.id,
          createdById: session.user.id,
        });
        const cashMovements = await tx.cashMovement.count({
          where: {
            paymentOrderId: doc.id,
            type: { in: ["INCOME", "EXPENSE"] },
          },
        });
        if (cashMovements > 0) {
          await reverseCashMovementsForTreasuryDoc(tx, {
            organizationId: session.organizationId,
            paymentOrderId: doc.id,
            createdById: session.user.id,
          });
        }
      }

      await tx.paymentOrder.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });

      return doc;
    });

    revalidateTreasury({ kind: "payment-order", id });
    return { ok: true, id, number: result.number };
  } catch (error) {
    console.error("cancelPaymentOrder", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo anular la orden de pago.",
    };
  }
}

export async function syncPostedDocumentToCash(
  kind: "receipt" | "payment-order",
  id: string,
): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const result = await prisma.$transaction(async (tx) => {
      if (kind === "receipt") {
        const doc = await tx.receipt.findFirst({
          where: { id, organizationId: session.organizationId },
        });
        if (!doc) throw new Error("Recibo no encontrado.");
        if (doc.status !== "POSTED") {
          throw new Error("Solo se puede sincronizar un recibo ya imputado.");
        }

        if (doc.paymentMethod !== "CASH") {
          await tx.receipt.update({
            where: { id },
            data: { paymentMethod: "CASH" },
          });
        }

        const existing = await tx.cashMovement.findFirst({
          where: { receiptId: id, type: { in: ["INCOME", "EXPENSE"] } },
        });
        if (!existing) {
          await postCashMovementFromTreasuryDoc(tx, {
            organizationId: session.organizationId,
            currency: doc.currency,
            amount: toNumber(doc.totalAmount),
            kind: "INCOME",
            description: `Recibo ${doc.number}${doc.partyName ? ` · ${doc.partyName}` : ""}`,
            receiptId: doc.id,
            createdById: session.user.id,
          });
        }

        return { id: doc.id, number: doc.number };
      }

      const doc = await tx.paymentOrder.findFirst({
        where: { id, organizationId: session.organizationId },
      });
      if (!doc) throw new Error("Orden de pago no encontrada.");
      if (doc.status !== "POSTED") {
        throw new Error("Solo se puede sincronizar una OP ya imputada.");
      }

      if (doc.paymentMethod !== "CASH") {
        await tx.paymentOrder.update({
          where: { id },
          data: { paymentMethod: "CASH" },
        });
      }

      const existing = await tx.cashMovement.findFirst({
        where: { paymentOrderId: id, type: { in: ["INCOME", "EXPENSE"] } },
      });
      if (!existing) {
        await postCashMovementFromTreasuryDoc(tx, {
          organizationId: session.organizationId,
          currency: doc.currency,
          amount: toNumber(doc.totalAmount),
          kind: "EXPENSE",
          description: `OP ${doc.number}${doc.partyName ? ` · ${doc.partyName}` : ""}`,
          paymentOrderId: doc.id,
          createdById: session.user.id,
        });
      }

      return { id: doc.id, number: doc.number };
    });

    revalidateTreasury({ kind, id });
    return { ok: true, id: result.id, number: result.number };
  } catch (error) {
    console.error("syncPostedDocumentToCash", error);
    return failFromError(error, "No se pudo registrar el movimiento en caja.");
  }
}
