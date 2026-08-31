import { AdjustmentIndex, BillStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computePeriodCommissionTotal,
  splitAmountIntoInstallments,
  splitCommissionAmount,
  computeContractTotalCommission,
  resolveCommissionMode,
} from "@/features/contracts/lib/commission";
import {
  computeBillTotalAmount,
  generateTenantServiceBill,
} from "@/server/services/contract-services-billing";
import { computeBillStatus as computeBillStatusFromUtils } from "@/server/services/bill-utils";
import { tenantBillPeriodKey } from "@/features/billing/lib/tenant-bill-kind";
import { formatInstallmentLabel } from "@/features/billing/lib/installment-label";

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
): Promise<{
  ordinary: number;
  extraordinary: number;
  services: number;
  servicesExtraordinary: number;
}> {
  const allocations = await prisma.expenseAllocation.findMany({
    where: {
      unitId,
      expense: {
        periodYear: year,
        periodMonth: month,
        billToTenant: true,
      },
    },
    include: { expense: { select: { type: true, ledger: true } } },
  });

  let ordinary = 0;
  let extraordinary = 0;
  let services = 0;
  let servicesExtraordinary = 0;
  for (const a of allocations) {
    const amount = Number(a.amount);
    const isServices = a.expense.ledger === "SERVICES";
    if (a.expense.type === "EXTRAORDINARY") {
      if (isServices) servicesExtraordinary += amount;
      else extraordinary += amount;
    } else if (isServices) {
      services += amount;
    } else {
      ordinary += amount;
    }
  }
  return {
    ordinary: round2(ordinary),
    extraordinary: round2(extraordinary),
    services: round2(services),
    servicesExtraordinary: round2(servicesExtraordinary),
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
  if (bill.kind !== "RENT") return bill;

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

  const totalAmount = computeBillTotalAmount({
    rentAmount: Number(bill.rentAmount),
    expensesAmount,
    contractServicesAmount: 0,
    commissionAmount: Number(bill.commissionAmount),
    lateFeeAmount: Number(bill.lateFeeAmount),
    otherAmount: Number(bill.otherAmount),
  });
  const status = computeBillStatus(
    totalAmount,
    Number(bill.paidAmount),
    bill.dueDate,
  );

  return prisma.tenantBill.update({
    where: { id: billId },
    data: { expensesAmount, contractServicesAmount: 0, totalAmount, status },
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
      kind: "RENT",
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
    where: tenantBillPeriodKey({
      contractId: input.contractId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      kind: "RENT",
    }),
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

  const totalAmount = computeBillTotalAmount({
    rentAmount,
    expensesAmount,
    contractServicesAmount: 0,
    commissionAmount,
    lateFeeAmount: 0,
    otherAmount: 0,
  });
  const status = computeBillStatusFromUtils(totalAmount, 0, dueDate);

  return prisma.tenantBill.create({
    data: {
      contractId: input.contractId,
      kind: "RENT",
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      dueDate,
      rentAmount,
      expensesAmount,
      contractServicesAmount: 0,
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
    const serviceBill = await generateTenantServiceBill({
      contractId: c.id,
      periodYear: year,
      periodMonth: month,
      dueDay,
    });
    if (serviceBill) results.push(serviceBill);
  }
  return results;
}

/**
 * Genera todas las cuotas de alquiler del contrato (un mes por período
 * entre inicio y fin inclusive), con vencimiento el día configurado
 * (por defecto el 10).
 */
export async function generateTenantBillsForContract(
  contractId: string,
  options?: { dueDay?: number },
) {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: {
      organization: { select: { billDueDay: true } },
    },
  });

  if (contract.status !== "ACTIVE") {
    throw new Error("Solo se facturan contratos activos");
  }

  const dueDay = Math.min(
    28,
    Math.max(
      1,
      options?.dueDay ?? contract.organization?.billDueDay ?? 10,
    ),
  );

  const start = contract.startDate;
  const end = contract.endDate;
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;

  const results = [];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const rentBill = await generateTenantBill({
      contractId,
      periodYear: year,
      periodMonth: month,
      dueDay,
    });
    results.push(rentBill);
    const serviceBill = await generateTenantServiceBill({
      contractId,
      periodYear: year,
      periodMonth: month,
      dueDate: rentBill.dueDate,
    });
    if (serviceBill) results.push(serviceBill);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return results;
}

/**
 * Honorarios sobre el total del contrato: calcula % del valor total
 * (alquiler × meses) y carga la parte del inquilino en N cuotas con
 * vencimiento día 10 (o dueDay), empezando el mes de inicio.
 */
export async function generateContractTotalCommissionInstallments(
  contractId: string,
  options?: { dueDay?: number },
) {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { organization: { select: { billDueDay: true } } },
  });

  if (resolveCommissionMode(contract) !== "CONTRACT_TOTAL") {
    return [];
  }

  const dueDay = Math.min(
    28,
    Math.max(
      1,
      options?.dueDay ?? contract.organization?.billDueDay ?? 10,
    ),
  );

  const { total, installments, percent, gross } =
    computeContractTotalCommission(contract);
  if (!(total > 0) || installments < 1) return [];

  const { tenant: tenantTotal } = splitCommissionAmount(total, contract);
  if (!(tenantTotal > 0)) return [];

  const amounts = splitAmountIntoInstallments(tenantTotal, installments);
  const startY = contract.startDate.getUTCFullYear();
  const startM = contract.startDate.getUTCMonth() + 1;
  const results = [];

  for (let i = 0; i < amounts.length; i++) {
    const amount = amounts[i]!;
    if (!(amount > 0.009)) continue;

    const idx = startY * 12 + (startM - 1) + i;
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const dueDate = new Date(Date.UTC(year, month - 1, dueDay));

    const existing = await prisma.tenantBill.findUnique({
      where: tenantBillPeriodKey({
        contractId,
        periodYear: year,
        periodMonth: month,
        kind: "RENT",
      }),
    });

    if (existing) {
      if (
        existing.status === "PAID" ||
        existing.status === "CANCELLED"
      ) {
        continue;
      }
      const commissionAmount = round2(
        Number(existing.commissionAmount) + amount,
      );
      const totalAmount = computeBillTotalAmount({
        rentAmount: Number(existing.rentAmount),
        expensesAmount: Number(existing.expensesAmount),
        contractServicesAmount: 0,
        commissionAmount,
        lateFeeAmount: Number(existing.lateFeeAmount),
        otherAmount: Number(existing.otherAmount),
      });
      const noteLine = `Honorarios ${percent}% s/ total contrato (${gross}) · cuota ${i + 1}/${installments}`;
      results.push(
        await prisma.tenantBill.update({
          where: { id: existing.id },
          data: {
            commissionAmount,
            totalAmount,
            status: computeBillStatus(
              totalAmount,
              Number(existing.paidAmount),
              existing.dueDate,
            ),
            notes: existing.notes
              ? `${existing.notes}\n${noteLine}`
              : noteLine,
          },
        }),
      );
      continue;
    }

    const totalAmount = amount;
    results.push(
      await prisma.tenantBill.create({
        data: {
          contractId,
          kind: "RENT",
          periodYear: year,
          periodMonth: month,
          dueDate,
          rentAmount: 0,
          expensesAmount: 0,
          contractServicesAmount: 0,
          lateFeeAmount: 0,
          otherAmount: 0,
          commissionAmount: amount,
          totalAmount,
          paidAmount: 0,
          currency: contract.currency,
          status: computeBillStatus(totalAmount, 0, dueDate),
          notes: `Honorarios ${percent}% s/ total contrato (${gross}) · cuota ${i + 1}/${installments}`,
        },
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
  return computeBillStatusFromUtils(total, paid, dueDate);
}

export async function applyLateFee(billId: string) {
  const bill = await prisma.tenantBill.findUniqueOrThrow({
    where: { id: billId },
    select: {
      id: true,
      status: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      lateFeeAmount: true,
      contract: { select: { lateFeeDailyRatePct: true } },
    },
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
  try {
    const today = startOfUtcDay();
    const bills = await prisma.tenantBill.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        dueDate: { lt: today },
        contract: { organizationId },
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        lateFeeAmount: true,
        contract: { select: { lateFeeDailyRatePct: true } },
      },
      take: 80,
      orderBy: { dueDate: "asc" },
    });

    let updated = 0;
    for (const bill of bills) {
      const rate = Number(bill.contract.lateFeeDailyRatePct);
      if (rate > 0) {
        const next = await applyLateFee(bill.id);
        if (
          next.status !== bill.status ||
          Number(next.lateFeeAmount) !== Number(bill.lateFeeAmount)
        ) {
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
  } catch (error) {
    console.error("syncOverdueBills", error);
    return 0;
  }
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
  indexType?: AdjustmentIndex;
}) {
  if (!(input.percent > 0)) {
    throw new Error("El porcentaje de ajuste debe ser mayor a 0");
  }

  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: input.contractId },
    include: {
      adjustments: { orderBy: { createdAt: "asc" } },
    },
  });

  const policy = contract.adjustments[0];
  const currentRent = await getCurrentRent(input.contractId);
  const appliedRent = round2(currentRent * (1 + input.percent / 100));

  const created = await prisma.contractAdjustment.create({
    data: {
      contractId: input.contractId,
      indexType: input.indexType ?? policy?.indexType ?? "ICL",
      periodMonths: policy?.periodMonths ?? 6,
      customPercent: input.percent,
      effectiveFrom: input.effectiveFrom,
      appliedRent,
      notes:
        input.notes?.trim() ||
        `Ajuste ${input.percent}% sobre ${currentRent}`,
    },
  });

  await updateOpenBillsRentFrom(
    input.contractId,
    input.effectiveFrom.getUTCFullYear(),
    input.effectiveFrom.getUTCMonth() + 1,
  );

  return created;
}

/** Recalcula alquiler/honorarios en cuotas abiertas desde un período inclusive. */
export async function updateOpenBillsRentFrom(
  contractId: string,
  fromYear: number,
  fromMonth: number,
) {
  const rent = await getCurrentRent(contractId);
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
  });

  const bills = await prisma.tenantBill.findMany({
    where: {
      contractId,
      kind: "RENT",
      status: { in: OPEN_BILL_STATUSES },
      OR: [
        { periodYear: { gt: fromYear } },
        {
          AND: [
            { periodYear: fromYear },
            { periodMonth: { gte: fromMonth } },
          ],
        },
      ],
    },
  });

  for (const bill of bills) {
    const mode = resolveCommissionMode(contract);
    let commissionAmount = Number(bill.commissionAmount);
    // CONTRACT_TOTAL ya repartió honorarios en cuotas fijas: no pisarlos.
    if (mode !== "CONTRACT_TOTAL") {
      const { total: commissionTotal } = computePeriodCommissionTotal(
        contract,
        rent,
      );
      const split = splitCommissionAmount(commissionTotal, contract);
      commissionAmount = split.tenant;
    }
    const totalAmount = computeBillTotalAmount({
      rentAmount: rent,
      expensesAmount: Number(bill.expensesAmount),
      contractServicesAmount: 0,
      commissionAmount,
      lateFeeAmount: Number(bill.lateFeeAmount),
      otherAmount: Number(bill.otherAmount),
    });
    const status = computeBillStatus(
      totalAmount,
      Number(bill.paidAmount),
      bill.dueDate,
    );
    await prisma.tenantBill.update({
      where: { id: bill.id },
      data: {
        rentAmount: rent,
        commissionAmount,
        contractServicesAmount: 0,
        totalAmount,
        status,
      },
    });
  }
}

function monthsBetween(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
) {
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function addMonths(year: number, month: number, delta: number) {
  const idx = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(idx / 12),
    month: (idx % 12) + 1,
  };
}

/**
 * Al cargar índices de un mes, aplica el mayor % (IPC/ICL/CP) a contratos
 * activos cuyo próximo aumento cae el mes siguiente (ej. carga junio →
 * aumenta julio si el contrato ajusta cada 6 meses desde enero).
 */
export async function applyDueAdjustmentsFromIndexRates(input: {
  organizationId: string;
  periodYear: number;
  periodMonth: number;
  periodMonths: number;
  percent: number;
}) {
  if (!(input.percent > 0)) {
    return { applied: 0, skipped: 0, percent: input.percent };
  }

  const effective = addMonths(input.periodYear, input.periodMonth, 1);
  const effectiveFrom = new Date(
    Date.UTC(effective.year, effective.month - 1, 1),
  );

  const contracts = await prisma.contract.findMany({
    where: {
      organizationId: input.organizationId,
      status: "ACTIVE",
    },
    include: {
      adjustments: { orderBy: { createdAt: "asc" } },
    },
  });

  let applied = 0;
  let skipped = 0;

  for (const contract of contracts) {
    const policy = contract.adjustments[0];
    if (!policy) {
      skipped += 1;
      continue;
    }
    if (policy.periodMonths !== input.periodMonths) {
      continue;
    }
    if (
      policy.indexType === "FIXED" ||
      policy.indexType === "CUSTOM_PERCENT"
    ) {
      continue;
    }

    const startY = contract.startDate.getUTCFullYear();
    const startM = contract.startDate.getUTCMonth() + 1;
    const diff = monthsBetween(
      startY,
      startM,
      effective.year,
      effective.month,
    );
    if (diff <= 0 || diff % input.periodMonths !== 0) {
      continue;
    }

    const already = await prisma.contractAdjustment.findFirst({
      where: {
        contractId: contract.id,
        appliedRent: { not: null },
        effectiveFrom,
      },
      select: { id: true },
    });
    if (already) {
      skipped += 1;
      continue;
    }

    await applyContractAdjustment({
      contractId: contract.id,
      percent: input.percent,
      effectiveFrom,
      indexType: "MAX_ICL_IPC_CP",
      notes: `Ajuste automático ${input.percent}% (máx. IPC/ICL/CP) · período ${input.periodMonths}m · carga ${input.periodMonth}/${input.periodYear} → vigencia ${effective.month}/${effective.year}`,
    });
    applied += 1;
  }

  return { applied, skipped, percent: input.percent, effective };
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
            startDate: true,
            endDate: true,
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
      const period = formatInstallmentLabel({
        contractStart: bill.contract.startDate,
        contractEnd: bill.contract.endDate,
        periodYear: bill.periodYear,
        periodMonth: bill.periodMonth,
      });
      const desc = [
        `Cobro ${period}`,
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
