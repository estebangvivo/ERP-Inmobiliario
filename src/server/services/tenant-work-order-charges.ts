import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeBillTotalAmount } from "@/server/services/contract-services-billing";
import { computeBillStatus as computeBillStatusFromUtils } from "@/server/services/bill-utils";
import { tenantBillPeriodKey } from "@/features/billing/lib/tenant-bill-kind";

type Tx = Prisma.TransactionClient;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function billMarker(invoiceId: string) {
  return `supplierInvoice:${invoiceId}`;
}

/**
 * Al imputar una OP de factura OT a cargo del inquilino, abre/actualiza una
 * cuota SERVICES con otherAmount para que figure en la CC del inquilino.
 */
export async function openTenantChargeForSupplierInvoice(
  tx: Tx,
  organizationId: string,
  supplierInvoiceId: string,
) {
  const inv = await tx.supplierInvoice.findFirst({
    where: {
      id: supplierInvoiceId,
      workOrder: { organizationId },
      costBearer: "TENANT",
    },
    include: {
      workOrder: {
        select: {
          id: true,
          code: true,
          contractId: true,
          propertyId: true,
        },
      },
    },
  });
  if (!inv) return;

  let contractId = inv.workOrder.contractId;
  if (!contractId) {
    const contract = await tx.contract.findFirst({
      where: {
        organizationId,
        propertyId: inv.workOrder.propertyId,
        status: "ACTIVE",
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    contractId = contract?.id ?? null;
  }
  if (!contractId) {
    throw new Error(
      "Factura a cargo del inquilino sin contrato activo vinculado a la OT.",
    );
  }

  const contract = await tx.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, currency: true },
  });
  if (!contract) {
    throw new Error("Contrato no encontrado para cargo a inquilino.");
  }

  const amount = round2(Number(inv.amount));
  if (!(amount > 0)) return;

  const marker = billMarker(inv.id);
  const existingWithMarker = await tx.tenantBill.findFirst({
    where: {
      contractId,
      notes: { contains: marker },
      status: { not: "CANCELLED" },
    },
  });
  if (existingWithMarker) return;

  const now = new Date();
  const periodYear = now.getUTCFullYear();
  const periodMonth = now.getUTCMonth() + 1;
  const dueDate = new Date(
    Date.UTC(periodYear, periodMonth - 1, Math.min(now.getUTCDate() + 7, 28)),
  );

  const key = tenantBillPeriodKey({
    contractId,
    periodYear,
    periodMonth,
    kind: "SERVICES",
  });

  const existing = await tx.tenantBill.findUnique({ where: key });
  const noteLine = `${marker} · OT ${inv.workOrder.code} · factura ${inv.invoiceNumber ?? inv.id.slice(-6)}`;

  if (existing && existing.status !== "CANCELLED" && existing.status !== "PAID") {
    const otherAmount = round2(Number(existing.otherAmount) + amount);
    const totalAmount = computeBillTotalAmount({
      rentAmount: Number(existing.rentAmount),
      expensesAmount: Number(existing.expensesAmount),
      contractServicesAmount: Number(existing.contractServicesAmount),
      commissionAmount: Number(existing.commissionAmount),
      lateFeeAmount: Number(existing.lateFeeAmount),
      otherAmount,
    });
    const notes = [existing.notes, noteLine].filter(Boolean).join("\n");
    await tx.tenantBill.update({
      where: { id: existing.id },
      data: {
        otherAmount,
        totalAmount,
        notes,
        status: computeBillStatusFromUtils(
          totalAmount,
          Number(existing.paidAmount),
          existing.dueDate,
        ),
      },
    });
    return;
  }

  if (existing && (existing.status === "PAID" || existing.status === "CANCELLED")) {
    // Período ya cerrado: crear nota en otherAmount de un bill “adhoc” no es posible
    // por unique; sumamos a otherAmount reabriendo si CANCELLED o usamos RENT del mes.
    const rentKey = tenantBillPeriodKey({
      contractId,
      periodYear,
      periodMonth,
      kind: "RENT",
    });
    const rentBill = await tx.tenantBill.findUnique({ where: rentKey });
    if (
      rentBill &&
      rentBill.status !== "PAID" &&
      rentBill.status !== "CANCELLED"
    ) {
      const otherAmount = round2(Number(rentBill.otherAmount) + amount);
      const totalAmount = computeBillTotalAmount({
        rentAmount: Number(rentBill.rentAmount),
        expensesAmount: Number(rentBill.expensesAmount),
        contractServicesAmount: Number(rentBill.contractServicesAmount),
        commissionAmount: Number(rentBill.commissionAmount),
        lateFeeAmount: Number(rentBill.lateFeeAmount),
        otherAmount,
      });
      await tx.tenantBill.update({
        where: { id: rentBill.id },
        data: {
          otherAmount,
          totalAmount,
          notes: [rentBill.notes, noteLine].filter(Boolean).join("\n"),
          status: computeBillStatusFromUtils(
            totalAmount,
            Number(rentBill.paidAmount),
            rentBill.dueDate,
          ),
        },
      });
      return;
    }
  }

  if (!existing) {
    const totalAmount = computeBillTotalAmount({
      rentAmount: 0,
      expensesAmount: 0,
      contractServicesAmount: 0,
      commissionAmount: 0,
      lateFeeAmount: 0,
      otherAmount: amount,
    });
    await tx.tenantBill.create({
      data: {
        contractId,
        kind: "SERVICES",
        periodYear,
        periodMonth,
        dueDate,
        rentAmount: 0,
        expensesAmount: 0,
        contractServicesAmount: 0,
        lateFeeAmount: 0,
        otherAmount: amount,
        commissionAmount: 0,
        totalAmount,
        paidAmount: 0,
        currency: contract.currency,
        status: computeBillStatusFromUtils(totalAmount, 0, dueDate),
        notes: noteLine,
      },
    });
  }
}

export async function reverseTenantChargeForSupplierInvoice(
  tx: Tx,
  organizationId: string,
  supplierInvoiceId: string,
) {
  const inv = await tx.supplierInvoice.findFirst({
    where: {
      id: supplierInvoiceId,
      workOrder: { organizationId },
      costBearer: "TENANT",
    },
  });
  if (!inv) return;

  const marker = billMarker(inv.id);
  const amount = round2(Number(inv.amount));
  const bills = await tx.tenantBill.findMany({
    where: {
      notes: { contains: marker },
      status: { not: "CANCELLED" },
    },
  });

  for (const bill of bills) {
    const otherAmount = round2(Math.max(0, Number(bill.otherAmount) - amount));
    const totalAmount = computeBillTotalAmount({
      rentAmount: Number(bill.rentAmount),
      expensesAmount: Number(bill.expensesAmount),
      contractServicesAmount: Number(bill.contractServicesAmount),
      commissionAmount: Number(bill.commissionAmount),
      lateFeeAmount: Number(bill.lateFeeAmount),
      otherAmount,
    });
    const notes = (bill.notes ?? "")
      .split("\n")
      .filter((line) => !line.includes(marker))
      .join("\n")
      .trim();

    if (
      totalAmount <= 0 &&
      Number(bill.paidAmount) <= 0 &&
      Number(bill.rentAmount) <= 0 &&
      Number(bill.expensesAmount) <= 0 &&
      Number(bill.contractServicesAmount) <= 0
    ) {
      await tx.tenantBill.update({
        where: { id: bill.id },
        data: {
          otherAmount: 0,
          totalAmount: 0,
          status: "CANCELLED",
          notes: notes || null,
        },
      });
    } else {
      await tx.tenantBill.update({
        where: { id: bill.id },
        data: {
          otherAmount,
          totalAmount,
          notes: notes || null,
          status: computeBillStatusFromUtils(
            totalAmount,
            Number(bill.paidAmount),
            bill.dueDate,
          ),
        },
      });
    }
  }
}

/** Resolución de contrato para pagos OT (exportada para actions). */
export async function resolveWorkOrderContractId(
  organizationId: string,
  workOrder: { contractId: string | null; propertyId: string },
) {
  if (workOrder.contractId) return workOrder.contractId;
  const contract = await prisma.contract.findFirst({
    where: {
      organizationId,
      propertyId: workOrder.propertyId,
      status: "ACTIVE",
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  return contract?.id ?? null;
}
