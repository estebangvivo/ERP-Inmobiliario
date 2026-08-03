import { BillStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computePeriodCommissionTotal,
  splitCommissionAmount,
} from "@/features/contracts/lib/commission";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function daysOverdue(dueDate: Date, asOf: Date = new Date()) {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date(asOf);
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

export async function getCurrentRent(contractId: string): Promise<number> {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: {
      adjustments: { orderBy: { effectiveFrom: "desc" } },
    },
  });

  const applied = contract.adjustments.find((a) => a.appliedRent != null);
  if (applied?.appliedRent != null) return Number(applied.appliedRent);
  return Number(contract.initialRent);
}

export async function getUnitExpenseAmount(
  unitId: string,
  year: number,
  month: number,
  includesOrdinary: boolean,
  includesExtraord: boolean,
): Promise<number> {
  if (!includesOrdinary && !includesExtraord) return 0;

  const typeFilter =
    includesOrdinary && includesExtraord
      ? undefined
      : includesOrdinary
        ? ({ type: "ORDINARY" as const })
        : ({ type: "EXTRAORDINARY" as const });

  const allocations = await prisma.expenseAllocation.findMany({
    where: {
      unitId,
      expense: {
        periodYear: year,
        periodMonth: month,
        billToTenant: true,
        ...(typeFilter ?? {}),
      },
    },
  });

  return round2(allocations.reduce((sum, a) => sum + Number(a.amount), 0));
}

export async function generateTenantBill(input: {
  contractId: string;
  periodYear: number;
  periodMonth: number;
  dueDay?: number;
}) {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: input.contractId },
    include: { property: true },
  });

  if (contract.status !== "ACTIVE") {
    throw new Error("Solo se facturan contratos activos");
  }

  const existing = await prisma.tenantBill.findUnique({
    where: {
      contractId_periodYear_periodMonth: {
        contractId: input.contractId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
      },
    },
  });
  if (existing) return existing;

  const rentAmount = await getCurrentRent(input.contractId);
  let expensesAmount = 0;

  if (contract.property.unitId) {
    expensesAmount = await getUnitExpenseAmount(
      contract.property.unitId,
      input.periodYear,
      input.periodMonth,
      contract.includesOrdinaryExp,
      contract.includesExtraordExp,
    );
  }

  const { total: commissionTotal } = computePeriodCommissionTotal(
    contract,
    rentAmount,
  );
  const { tenant: commissionAmount } = splitCommissionAmount(
    commissionTotal,
    contract,
  );

  const dueDay = input.dueDay ?? 10;
  const dueDate = new Date(
    Date.UTC(input.periodYear, input.periodMonth - 1, dueDay),
  );

  const totalAmount = round2(rentAmount + expensesAmount + commissionAmount);

  return prisma.tenantBill.create({
    data: {
      contractId: input.contractId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      dueDate,
      rentAmount,
      expensesAmount,
      lateFeeAmount: 0,
      otherAmount: 0,
      commissionAmount,
      totalAmount,
      paidAmount: 0,
      currency: contract.currency,
      status: "PENDING",
    },
  });
}

export async function generateBillsForPeriod(
  organizationId: string,
  year: number,
  month: number,
) {
  const contracts = await prisma.contract.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true },
  });

  const results = [];
  for (const c of contracts) {
    results.push(
      await generateTenantBill({
        contractId: c.id,
        periodYear: year,
        periodMonth: month,
      }),
    );
  }
  return results;
}

export function computeBillStatus(
  total: number,
  paid: number,
  dueDate: Date,
): BillStatus {
  if (paid <= 0) {
    return daysOverdue(dueDate) > 0 ? "OVERDUE" : "PENDING";
  }
  if (paid + 0.001 >= total) return "PAID";
  return daysOverdue(dueDate) > 0 ? "OVERDUE" : "PARTIAL";
}

export async function applyLateFee(billId: string) {
  const bill = await prisma.tenantBill.findUniqueOrThrow({
    where: { id: billId },
    include: { contract: true },
  });

  if (bill.status === "PAID" || bill.status === "CANCELLED") return bill;

  const overdue = daysOverdue(bill.dueDate);
  if (overdue <= 0) return bill;

  const base = Number(bill.totalAmount) - Number(bill.lateFeeAmount);
  const dailyRate = Number(bill.contract.lateFeeDailyRatePct) / 100;
  const lateFee = round2(base * dailyRate * overdue);
  const totalAmount = round2(base + lateFee);
  const status = computeBillStatus(
    totalAmount,
    Number(bill.paidAmount),
    bill.dueDate,
  );

  return prisma.tenantBill.update({
    where: { id: billId },
    data: { lateFeeAmount: lateFee, totalAmount, status },
  });
}

export async function recordPayment(input: {
  tenantBillId: string;
  amount: number;
  method: "CASH" | "BANK_TRANSFER" | "CHECK" | "CARD" | "GATEWAY" | "OTHER";
  paidAt?: Date;
  reference?: string;
  recordedById?: string;
  notes?: string;
}) {
  if (input.amount <= 0) throw new Error("El monto debe ser positivo");

  return prisma.$transaction(async (tx) => {
    const bill = await tx.tenantBill.findUniqueOrThrow({
      where: { id: input.tenantBillId },
    });

    if (bill.status === "CANCELLED") {
      throw new Error("La cuota está cancelada");
    }

    const payment = await tx.payment.create({
      data: {
        tenantBillId: input.tenantBillId,
        amount: input.amount,
        currency: bill.currency,
        method: input.method,
        paidAt: input.paidAt ?? new Date(),
        reference: input.reference || null,
        recordedById: input.recordedById || null,
        notes: input.notes || null,
      },
    });

    const paidAmount = round2(Number(bill.paidAmount) + input.amount);
    const status = computeBillStatus(
      Number(bill.totalAmount),
      paidAmount,
      bill.dueDate,
    );

    await tx.tenantBill.update({
      where: { id: bill.id },
      data: { paidAmount, status },
    });

    return payment;
  });
}
