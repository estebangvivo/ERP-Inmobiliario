import type { Prisma, PaymentMethod, BillStatus } from "@prisma/client";
import { formatInstallmentLabel } from "@/features/billing/lib/installment-label";
import { round2 } from "@/features/treasury/lib/cash-labels";

type Tx = Prisma.TransactionClient;

function toNumber(
  value: { toNumber(): number } | number | Prisma.Decimal,
): number {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return value.toNumber();
  }
  return Number(value);
}

export type DocumentApplicationInput = {
  documentId: string;
  amount: number;
};

export function validateApplicationsSum(
  apps: DocumentApplicationInput[],
  docTotal: number,
  label: string,
): string | null {
  const cleaned = apps.filter((a) => a.amount > 0.009);
  if (cleaned.length === 0) return null;
  const sum = cleaned.reduce((acc, a) => acc + a.amount, 0);
  if (sum > docTotal + 0.009) {
    return `La suma aplicada a ${label} (${sum.toFixed(2)}) supera el total del documento (${docTotal.toFixed(2)}).`;
  }
  return null;
}

export async function replaceReceiptBillApps(
  tx: Tx,
  receiptId: string,
  apps: DocumentApplicationInput[],
) {
  await tx.receiptBillApplication.deleteMany({ where: { receiptId } });
  const rows = apps.filter((a) => a.amount > 0.009);
  if (rows.length === 0) return;
  await tx.receiptBillApplication.createMany({
    data: rows.map((a) => ({
      receiptId,
      tenantBillId: a.documentId,
      amount: round2(a.amount),
    })),
  });
}

/** @deprecated alias */
export const replaceReceiptCertificationApps = replaceReceiptBillApps;

export async function replacePaymentOrderInvoiceApps(
  tx: Tx,
  paymentOrderId: string,
  apps: DocumentApplicationInput[],
) {
  await tx.paymentOrderInvoiceApplication.deleteMany({
    where: { paymentOrderId },
  });
  const rows = apps.filter((a) => a.amount > 0.009);
  if (rows.length === 0) return;
  await tx.paymentOrderInvoiceApplication.createMany({
    data: rows.map((a) => ({
      paymentOrderId,
      supplierInvoiceId: a.documentId,
      amount: round2(a.amount),
    })),
  });
}

export async function replacePaymentOrderSettlementApps(
  tx: Tx,
  paymentOrderId: string,
  apps: DocumentApplicationInput[],
) {
  await tx.paymentOrderSettlementApplication.deleteMany({
    where: { paymentOrderId },
  });
  const rows = apps.filter((a) => a.amount > 0.009);
  if (rows.length === 0) return;
  await tx.paymentOrderSettlementApplication.createMany({
    data: rows.map((a) => ({
      paymentOrderId,
      ownerSettlementId: a.documentId,
      amount: round2(a.amount),
    })),
  });
}

function mapTreasuryMethodToPayment(
  method: string | null | undefined,
): PaymentMethod {
  switch (method) {
    case "CASH":
      return "CASH";
    case "TRANSFER":
      return "BANK_TRANSFER";
    case "CHECK":
      return "CHECK";
    default:
      return "OTHER";
  }
}

function billStatusFromPaid(
  total: number,
  paid: number,
  current: BillStatus,
): BillStatus {
  if (paid <= 0.009) {
    return current === "OVERDUE" ? "OVERDUE" : "PENDING";
  }
  if (paid >= total - 0.009) return "PAID";
  return "PARTIAL";
}

/**
 * Al imputar recibo: crea Payments (direction=1) o elimina los vinculados (direction=-1)
 * y recalcula paidAmount/status de TenantBill.
 */
export async function applyReceiptBillBalances(
  tx: Tx,
  organizationId: string,
  receiptId: string,
  direction: 1 | -1,
  opts?: { recordedById?: string | null; paymentMethod?: string | null } | string | null,
) {
  const recordedById =
    typeof opts === "string" || opts == null
      ? (opts as string | null | undefined)
      : opts.recordedById;
  const receipt = await tx.receipt.findFirst({
    where: { id: receiptId, organizationId },
    include: { payments: true },
  });
  if (!receipt) throw new Error("Recibo no encontrado.");

  const apps = await tx.receiptBillApplication.findMany({
    where: { receiptId },
  });
  if (apps.length === 0) return;

  const primaryMethod = mapTreasuryMethodToPayment(
    receipt.payments[0]?.method ?? receipt.paymentMethod,
  );

  for (const app of apps) {
    const bill = await tx.tenantBill.findFirst({
      where: {
        id: app.tenantBillId,
        contract: { organizationId },
      },
      include: {
        contract: { select: { startDate: true, endDate: true } },
      },
    });
    if (!bill) throw new Error("Cuota aplicada no encontrada.");

    const amount = round2(toNumber(app.amount));
    const total = toNumber(bill.totalAmount);

    if (direction === 1) {
      const nextPaid = round2(toNumber(bill.paidAmount) + amount);
      if (nextPaid > total + 0.009) {
        throw new Error(
          `El cobro supera el saldo de ${formatInstallmentLabel({
            contractStart: bill.contract.startDate,
            contractEnd: bill.contract.endDate,
            periodYear: bill.periodYear,
            periodMonth: bill.periodMonth,
          })}.`,
        );
      }
      const payment = await tx.payment.create({
        data: {
          tenantBillId: bill.id,
          amount,
          currency: bill.currency,
          method: primaryMethod,
          paidAt: receipt.issueDate,
          notes: `Tesorería ${receipt.number}`,
          recordedById: recordedById ?? undefined,
          receiptId: receipt.id,
        },
      });
      await tx.receiptBillApplication.update({
        where: { id: app.id },
        data: { paymentId: payment.id },
      });
      await tx.tenantBill.update({
        where: { id: bill.id },
        data: {
          paidAmount: nextPaid,
          status: billStatusFromPaid(total, nextPaid, bill.status),
        },
      });
    } else {
      if (app.paymentId) {
        await tx.payment.delete({ where: { id: app.paymentId } }).catch(() => null);
      } else {
        const linked = await tx.payment.findFirst({
          where: {
            tenantBillId: bill.id,
            receiptId: receipt.id,
            amount,
          },
        });
        if (linked) await tx.payment.delete({ where: { id: linked.id } });
      }
      await tx.receiptBillApplication.update({
        where: { id: app.id },
        data: { paymentId: null },
      });
      const nextPaid = round2(Math.max(0, toNumber(bill.paidAmount) - amount));
      await tx.tenantBill.update({
        where: { id: bill.id },
        data: {
          paidAmount: nextPaid,
          status: billStatusFromPaid(total, nextPaid, bill.status),
        },
      });
    }
  }
}

/** Alias compat */
export const applyReceiptCertificationBalances = applyReceiptBillBalances;

export async function applyPaymentOrderInvoiceBalances(
  tx: Tx,
  organizationId: string,
  paymentOrderId: string,
  direction: 1 | -1,
) {
  const apps = await tx.paymentOrderInvoiceApplication.findMany({
    where: { paymentOrderId },
  });
  if (apps.length === 0) return;

  for (const app of apps) {
    const inv = await tx.supplierInvoice.findFirst({
      where: {
        id: app.supplierInvoiceId,
        workOrder: { organizationId },
      },
    });
    if (!inv) throw new Error("Factura de proveedor no encontrada.");

    if (direction === 1) {
      await tx.supplierInvoice.update({
        where: { id: inv.id },
        data: { paidAt: inv.paidAt ?? new Date() },
      });
    } else {
      await tx.supplierInvoice.update({
        where: { id: inv.id },
        data: { paidAt: null },
      });
    }
  }
}

export async function applyPaymentOrderSettlementBalances(
  tx: Tx,
  organizationId: string,
  paymentOrderId: string,
  direction: 1 | -1,
) {
  const apps = await tx.paymentOrderSettlementApplication.findMany({
    where: { paymentOrderId },
  });
  if (apps.length === 0) return;

  for (const app of apps) {
    const sett = await tx.ownerSettlement.findFirst({
      where: { id: app.ownerSettlementId, organizationId },
    });
    if (!sett) throw new Error("Rendición no encontrada.");

    if (direction === 1) {
      await tx.ownerSettlement.update({
        where: { id: sett.id },
        data: {
          paidAt: sett.paidAt ?? new Date(),
          status: "PAID",
        },
      });
    } else {
      await tx.ownerSettlement.update({
        where: { id: sett.id },
        data: {
          paidAt: null,
          status: sett.issuedAt ? "ISSUED" : "DRAFT",
        },
      });
    }
  }
}
