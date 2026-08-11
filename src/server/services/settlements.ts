import { prisma } from "@/lib/prisma";
import {
  computePeriodCommissionTotal,
  splitCommissionAmount,
} from "@/features/contracts/lib/commission";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * netPayout =
 *   collected rent attributable to owner
 *   − owner share of commission
 *   − deductible supplier invoices
 *   − extraordinary expenses not billed to tenant
 */
export async function generateOwnerSettlement(input: {
  organizationId: string;
  ownerId: string;
  periodYear: number;
  periodMonth: number;
  currency?: "ARS" | "USD" | "EUR";
}) {
  const currency = input.currency ?? "ARS";
  const periodStart = new Date(
    Date.UTC(input.periodYear, input.periodMonth - 1, 1),
  );
  const periodEnd = new Date(Date.UTC(input.periodYear, input.periodMonth, 1));

  const existing = await prisma.ownerSettlement.findUnique({
    where: {
      organizationId_ownerId_periodYear_periodMonth_currency: {
        organizationId: input.organizationId,
        ownerId: input.ownerId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        currency,
      },
    },
  });
  if (existing && existing.status !== "DRAFT") {
    throw new Error(
      `Ya existe una rendición emitida/pagada para este período (${existing.code}).`,
    );
  }

  const ownerships = await prisma.propertyOwnership.findMany({
    where: {
      ownerId: input.ownerId,
      property: { organizationId: input.organizationId },
    },
    include: { property: true },
  });

  const propertyIds = ownerships.map((o) => o.propertyId);
  const ownershipByProperty = new Map(
    ownerships.map((o) => [o.propertyId, Number(o.sharePct) / 100]),
  );

  const payments = await prisma.payment.findMany({
    where: {
      paidAt: { gte: periodStart, lt: periodEnd },
      currency,
      tenantBill: {
        contract: { propertyId: { in: propertyIds } },
      },
    },
    include: {
      tenantBill: {
        include: {
          contract: true,
        },
      },
    },
  });

  type Line = {
    concept: string;
    amount: number;
    tenantBillId?: string;
    supplierInvoiceId?: string;
  };

  const lines: Line[] = [];
  let grossRent = 0;
  let commissionAmount = 0;

  for (const payment of payments) {
    const share =
      ownershipByProperty.get(payment.tenantBill.contract.propertyId) ?? 0;
    if (share <= 0) continue;

    const bill = payment.tenantBill;
    const rentShareOfBill =
      Number(bill.totalAmount) > 0
        ? Number(bill.rentAmount) / Number(bill.totalAmount)
        : 1;
    const rentCollected = round2(
      Number(payment.amount) * rentShareOfBill * share,
    );

    const periodRent = Number(bill.rentAmount);
    const { total: periodCommission, label } = computePeriodCommissionTotal(
      bill.contract,
      periodRent,
    );
    const { owner: ownerCommissionFull } = splitCommissionAmount(
      periodCommission,
      bill.contract,
    );
    const rentRatio =
      periodRent > 0
        ? (Number(payment.amount) * rentShareOfBill) / periodRent
        : 0;
    const commission = round2(ownerCommissionFull * rentRatio * share);

    if (rentCollected > 0) {
      lines.push({
        concept: `Alquiler cobrado · cuota ${bill.periodMonth}/${bill.periodYear}`,
        amount: rentCollected,
        tenantBillId: bill.id,
      });
      grossRent = round2(grossRent + rentCollected);
    }
    if (commission > 0) {
      lines.push({
        concept: label,
        amount: -commission,
        tenantBillId: bill.id,
      });
      commissionAmount = round2(commissionAmount + commission);
    }
  }

  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      costBearer: "OWNER_DEDUCTIBLE",
      currency,
      invoiceDate: { gte: periodStart, lt: periodEnd },
      workOrder: { propertyId: { in: propertyIds } },
    },
    include: { workOrder: true },
  });

  let deductionsAmount = 0;
  for (const inv of invoices) {
    const share = ownershipByProperty.get(inv.workOrder.propertyId) ?? 0;
    const amount = round2(Number(inv.amount) * share);
    if (amount <= 0) continue;
    lines.push({
      concept: `Reparación deducible · ${inv.workOrder.title}`,
      amount: -amount,
      supplierInvoiceId: inv.id,
    });
    deductionsAmount = round2(deductionsAmount + amount);
  }

  const unitIds = ownerships
    .map((o) => o.property.unitId)
    .filter((id): id is string => Boolean(id));

  const extraAllocations = await prisma.expenseAllocation.findMany({
    where: {
      unitId: { in: unitIds },
      expense: {
        type: "EXTRAORDINARY",
        billToTenant: false,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        currency,
      },
    },
    include: { expense: true, unit: { include: { property: true } } },
  });

  let extraordinaryAmount = 0;
  for (const alloc of extraAllocations) {
    const propertyId = alloc.unit.property?.id;
    if (!propertyId) continue;
    const share = ownershipByProperty.get(propertyId) ?? 0;
    const amount = round2(Number(alloc.amount) * share);
    if (amount <= 0) continue;
    lines.push({
      concept: `Expensa extraordinaria · ${alloc.expense.concept}`,
      amount: -amount,
    });
    extraordinaryAmount = round2(extraordinaryAmount + amount);
  }

  const netPayout = round2(
    grossRent - commissionAmount - deductionsAmount - extraordinaryAmount,
  );

  const code = `REN-${input.periodYear}-${String(input.periodMonth).padStart(2, "0")}-${input.ownerId.slice(-4).toUpperCase()}`;

  if (existing) {
    await prisma.settlementLineItem.deleteMany({
      where: { settlementId: existing.id },
    });
    return prisma.ownerSettlement.update({
      where: { id: existing.id },
      data: {
        grossRent,
        commissionAmount,
        deductionsAmount,
        extraordinaryAmount,
        netPayout,
        status: "DRAFT",
        lines: { create: lines },
      },
      include: { lines: true, owner: true },
    });
  }

  return prisma.ownerSettlement.create({
    data: {
      organizationId: input.organizationId,
      code,
      ownerId: input.ownerId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      currency,
      grossRent,
      commissionAmount,
      deductionsAmount,
      extraordinaryAmount,
      netPayout,
      status: "DRAFT",
      lines: { create: lines },
    },
    include: { lines: true, owner: true },
  });
}

export async function issueSettlement(id: string) {
  return prisma.ownerSettlement.update({
    where: { id },
    data: { status: "ISSUED", issuedAt: new Date() },
  });
}

export async function markSettlementPaid(id: string, transferRef?: string) {
  return prisma.ownerSettlement.update({
    where: { id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      transferRef: transferRef || null,
    },
  });
}
