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

function startOfUtcDay(d: Date = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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

export async function getUnitExpenseBreakdown(
  unitId: string,
  year: number,
  month: number,
): Promise<{ ordinary: number; extraordinary: number }> {
  const allocations = await prisma.expenseAllocation.findMany({
    where: {
      unitId,
      expense: {
        periodYear: year,
        periodMonth: month,
        billToTenant: true,
      },
    },
    include: { expense: { select: { type: true } } },
  });

  let ordinary = 0;
  let extraordinary = 0;
  for (const a of allocations) {
    if (a.expense.type === "EXTRAORDINARY") {
      extraordinary += Number(a.amount);
    } else {
      ordinary += Number(a.amount);
    }
  }
  return {
    ordinary: round2(ordinary),
    extraordinary: round2(extraordinary),
  };
}

const OPEN_BILL_STATUSES: BillStatus[] = ["PENDING", "PARTIAL", "OVERDUE"];

/** Recalcula expensas en una cuota abierta (no PAID/CANCELLED). */
export async function syncTenantBillExpenses(billId: string) {
  const bill = await prisma.tenantBill.findUniqueOrThrow({
    where: { id: billId },
    include: {
      contract: { include: { property: true } },
    },
  });

  if (bill.status === "PAID" || bill.status === "CANCELLED") return bill;

  let expensesAmount = 0;
  if (bill.contract.property.unitId) {
    expensesAmount = await getUnitExpenseAmount(
      bill.contract.property.unitId,
      bill.periodYear,
      bill.periodMonth,
      bill.contract.includesOrdinaryExp,
      bill.contract.includesExtraordExp,
    );
  }

  const totalAmount = round2(
    Number(bill.rentAmount) +
      expensesAmount +
      Number(bill.commissionAmount) +
      Number(bill.lateFeeAmount) +
      Number(bill.otherAmount),
  );
  const status = computeBillStatus(
    totalAmount,
    Number(bill.paidAmount),
    bill.dueDate,
  );

  return prisma.tenantBill.update({
    where: { id: billId },
    data: { expensesAmount, totalAmount, status },
  });
}

/** Sync de cuotas abiertas de un período para unidades de un edificio. */
export async function syncOpenBillsForExpensePeriod(input: {
  complexId: string;
  periodYear: number;
  periodMonth: number;
}) {
  const units = await prisma.unit.findMany({
    where: { complexId: input.complexId },
    select: { id: true },
  });
  const unitIds = units.map((u) => u.id);
  if (unitIds.length === 0) return;

  const bills = await prisma.tenantBill.findMany({
    where: {
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      status: { in: OPEN_BILL_STATUSES },
      contract: {
        property: { unitId: { in: unitIds } },
      },
    },
    select: { id: true },
  });

  for (const bill of bills) {
    await syncTenantBillExpenses(bill.id);
  }
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
  if (existing) {
    if (
      existing.status === "PAID" ||
      existing.status === "CANCELLED"
    ) {
      return existing;
    }
    return syncTenantBillExpenses(existing.id);
  }

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
  const status = computeBillStatus(totalAmount, 0, dueDate);

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
      status,
    },
  });
}

export async function generateBillsForPeriod(
  organizationId: string,
  year: number,
  month: number,
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { billDueDay: true },
  });
  const dueDay = Math.min(28, Math.max(1, org?.billDueDay ?? 10));

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
        dueDay,
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
  if (overdue <= 0) {
    const status = computeBillStatus(
      Number(bill.totalAmount),
      Number(bill.paidAmount),
      bill.dueDate,
    );
    if (status !== bill.status) {
      return prisma.tenantBill.update({
        where: { id: billId },
        data: { status },
      });
    }
    return bill;
  }

  const dailyRate = Number(bill.contract.lateFeeDailyRatePct) / 100;
  if (dailyRate <= 0) {
    const status = computeBillStatus(
      Number(bill.totalAmount),
      Number(bill.paidAmount),
      bill.dueDate,
    );
    if (status === bill.status) return bill;
    return prisma.tenantBill.update({
      where: { id: billId },
      data: { status },
    });
  }

  const base = Number(bill.totalAmount) - Number(bill.lateFeeAmount);
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

/** Marca vencidas y recalcula mora (si hay tasa) para la org. */
export async function syncOverdueBills(organizationId: string) {
  const today = startOfUtcDay();
  const bills = await prisma.tenantBill.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      dueDate: { lt: today },
      contract: { organizationId },
    },
    include: { contract: { select: { lateFeeDailyRatePct: true } } },
  });

  let updated = 0;
  for (const bill of bills) {
    const rate = Number(bill.contract.lateFeeDailyRatePct);
    if (rate > 0) {
      const next = await applyLateFee(bill.id);
      if (next.status !== bill.status || Number(next.lateFeeAmount) !== Number(bill.lateFeeAmount)) {
        updated += 1;
      }
    } else {
      const status = computeBillStatus(
        Number(bill.totalAmount),
        Number(bill.paidAmount),
        bill.dueDate,
      );
      if (status !== bill.status) {
        await prisma.tenantBill.update({
          where: { id: bill.id },
          data: { status },
        });
        updated += 1;
      }
    }
  }
  return updated;
}

/** Sync de una cuota concreta (status + mora si aplica). */
export async function syncBillOverdueState(billId: string) {
  const bill = await prisma.tenantBill.findUnique({
    where: { id: billId },
    include: { contract: { select: { lateFeeDailyRatePct: true } } },
  });
  if (!bill || bill.status === "PAID" || bill.status === "CANCELLED") {
    return bill;
  }

  const overdue = daysOverdue(bill.dueDate);
  if (overdue <= 0) {
    const status = computeBillStatus(
      Number(bill.totalAmount),
      Number(bill.paidAmount),
      bill.dueDate,
    );
    if (status !== bill.status) {
      return prisma.tenantBill.update({
        where: { id: billId },
        data: { status },
      });
    }
    return bill;
  }

  if (Number(bill.contract.lateFeeDailyRatePct) > 0) {
    return applyLateFee(billId);
  }

  const status = computeBillStatus(
    Number(bill.totalAmount),
    Number(bill.paidAmount),
    bill.dueDate,
  );
  if (status !== bill.status) {
    return prisma.tenantBill.update({
      where: { id: billId },
      data: { status },
    });
  }
  return bill;
}

export async function applyContractAdjustment(input: {
  contractId: string;
  percent: number;
  effectiveFrom: Date;
  notes?: string;
}) {
  if (!(input.percent > 0)) {
    throw new Error("El porcentaje de ajuste debe ser mayor a 0");
  }

  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: input.contractId },
    include: {
      adjustments: { orderBy: { effectiveFrom: "desc" } },
    },
  });

  const policy = contract.adjustments[0];
  const currentRent = await getCurrentRent(input.contractId);
  const appliedRent = round2(currentRent * (1 + input.percent / 100));

  return prisma.contractAdjustment.create({
    data: {
      contractId: input.contractId,
      indexType: policy?.indexType ?? "ICL",
      periodMonths: policy?.periodMonths ?? 6,
      customPercent: input.percent,
      effectiveFrom: input.effectiveFrom,
      appliedRent,
      notes:
        input.notes?.trim() ||
        `Ajuste ${input.percent}% sobre ${currentRent}`,
    },
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
  /** Cuenta bancaria si method = BANK_TRANSFER */
  bankAccountId?: string;
  /** false = no mueve caja/banco (cobro ya venido de recibo). Default true. */
  postToTreasury?: boolean;
}) {
  if (input.amount <= 0) throw new Error("El monto debe ser positivo");

  const { applyPaymentTreasuryImpact } = await import(
    "@/features/treasury/lib/payment-from-billing"
  );

  return prisma.$transaction(async (tx) => {
    const bill = await tx.tenantBill.findUniqueOrThrow({
      where: { id: input.tenantBillId },
      include: {
        contract: {
          select: {
            organizationId: true,
            code: true,
            property: { select: { title: true } },
          },
        },
      },
    });

    if (bill.status === "CANCELLED") {
      throw new Error("La cuota está cancelada");
    }

    const organizationId = bill.contract.organizationId;
    if (!organizationId) {
      throw new Error("La cuota no tiene organización.");
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

    if (input.postToTreasury !== false) {
      const period = `${bill.periodMonth}/${bill.periodYear}`;
      const desc = [
        `Cobro cuota ${period}`,
        bill.contract.code,
        bill.contract.property.title,
        input.reference ? `Ref. ${input.reference}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      await applyPaymentTreasuryImpact(tx, {
        organizationId,
        currency: bill.currency,
        amount: input.amount,
        method: input.method,
        bankAccountId: input.bankAccountId,
        description: desc,
        createdById: input.recordedById,
      });
    }

    return payment;
  });
}
