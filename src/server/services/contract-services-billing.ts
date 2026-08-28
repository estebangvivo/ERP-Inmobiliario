import { prisma } from "@/lib/prisma";
import {
  resolveBillContractServiceLines,
  sumTenantContractServices,
} from "@/features/contracts/lib/contract-services";
import { tenantBillPeriodKey } from "@/features/billing/lib/tenant-bill-kind";
import type { ContractServicePaidBy, TenantBill } from "@prisma/client";
import { computeBillStatus } from "@/server/services/bill-utils";

const OPEN_BILL_STATUSES = ["PENDING", "PARTIAL", "OVERDUE"] as const;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeBillTotalAmount(input: {
  rentAmount: number;
  expensesAmount: number;
  contractServicesAmount: number;
  commissionAmount: number;
  lateFeeAmount: number;
  otherAmount: number;
}) {
  return round2(
    input.rentAmount +
      input.expensesAmount +
      input.contractServicesAmount +
      input.commissionAmount +
      input.lateFeeAmount +
      input.otherAmount,
  );
}

export function computeServiceBillTotalAmount(input: {
  contractServicesAmount: number;
  lateFeeAmount: number;
  otherAmount: number;
}) {
  return round2(
    input.contractServicesAmount + input.lateFeeAmount + input.otherAmount,
  );
}

export async function hasTenantContractServices(contractId: string) {
  const count = await prisma.contractService.count({
    where: {
      contractId,
      active: true,
      paidBy: "TENANT",
      amount: { gt: 0 },
    },
  });
  return count > 0;
}

export async function getContractServicesForBill(contractId: string) {
  return prisma.contractService.findMany({
    where: { contractId, active: true, paidBy: "TENANT" },
    orderBy: [{ sortOrder: "asc" }, { concept: "asc" }],
  });
}

export async function syncBillContractServiceLines(
  billId: string,
  options?: { overwrite?: boolean },
) {
  const overwrite = options?.overwrite ?? false;
  const bill = await prisma.tenantBill.findUniqueOrThrow({
    where: { id: billId },
    include: {
      contractServiceLines: true,
      contract: {
        include: {
          contractServices: {
            where: { active: true, paidBy: "TENANT" },
            orderBy: [{ sortOrder: "asc" }, { concept: "asc" }],
          },
        },
      },
    },
  });

  if (bill.kind !== "SERVICES") {
    throw new Error("Las líneas de servicios solo aplican a cuotas SERVICES");
  }

  if (bill.status === "PAID" || bill.status === "CANCELLED") {
    return bill;
  }

  const activeServiceIds = new Set(
    bill.contract.contractServices.map((s) => s.id),
  );

  for (const service of bill.contract.contractServices) {
    await prisma.tenantBillContractServiceLine.upsert({
      where: {
        tenantBillId_contractServiceId: {
          tenantBillId: billId,
          contractServiceId: service.id,
        },
      },
      create: {
        tenantBillId: billId,
        contractServiceId: service.id,
        concept: service.concept,
        amount: service.amount,
        paidBy: service.paidBy,
      },
      update: overwrite
        ? {
            concept: service.concept,
            amount: service.amount,
            paidBy: service.paidBy,
          }
        : {},
    });
  }

  const orphanLineIds = bill.contractServiceLines
    .filter((line) => !activeServiceIds.has(line.contractServiceId))
    .map((line) => line.id);

  if (orphanLineIds.length > 0) {
    await prisma.tenantBillContractServiceLine.deleteMany({
      where: { id: { in: orphanLineIds } },
    });
  }

  return bill;
}

export async function computeContractServicesAmountForBill(
  contractId: string,
  tenantBillId: string,
) {
  await syncBillContractServiceLines(tenantBillId, { overwrite: false });

  const [services, billLines] = await Promise.all([
    getContractServicesForBill(contractId),
    prisma.tenantBillContractServiceLine.findMany({
      where: { tenantBillId },
    }),
  ]);
  const lines = resolveBillContractServiceLines(services, billLines);
  return sumTenantContractServices(lines);
}

async function resyncServiceBillTotals(billId: string) {
  const bill = await prisma.tenantBill.findUniqueOrThrow({
    where: { id: billId },
  });
  if (bill.kind !== "SERVICES") return bill;
  if (bill.status === "PAID" || bill.status === "CANCELLED") return bill;

  const contractServicesAmount = await computeContractServicesAmountForBill(
    bill.contractId,
    bill.id,
  );
  const totalAmount = computeServiceBillTotalAmount({
    contractServicesAmount,
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
    data: { contractServicesAmount, totalAmount, status },
  });
}

/** Documento de servicios del mes (independiente del alquiler, mismo vencimiento). */
export async function generateTenantServiceBill(input: {
  contractId: string;
  periodYear: number;
  periodMonth: number;
  dueDay?: number;
  dueDate?: Date;
}): Promise<TenantBill | null> {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: input.contractId },
    select: { id: true, status: true, currency: true },
  });

  if (contract.status !== "ACTIVE") {
    throw new Error("Solo se facturan contratos activos");
  }

  const hasServices = await hasTenantContractServices(input.contractId);
  const existing = await prisma.tenantBill.findUnique({
    where: tenantBillPeriodKey({
      contractId: input.contractId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      kind: "SERVICES",
    }),
  });

  if (!hasServices) {
    if (
      existing &&
      existing.status !== "PAID" &&
      existing.status !== "CANCELLED" &&
      Number(existing.paidAmount) <= 0.001
    ) {
      await prisma.tenantBillContractServiceLine.deleteMany({
        where: { tenantBillId: existing.id },
      });
      await prisma.tenantBill.delete({ where: { id: existing.id } });
    }
    return null;
  }

  if (existing) {
    if (existing.status === "PAID" || existing.status === "CANCELLED") {
      return existing;
    }
    await syncBillContractServiceLines(existing.id, { overwrite: false });
    return resyncServiceBillTotals(existing.id);
  }

  let dueDate = input.dueDate;
  if (!dueDate) {
    const dueDay = input.dueDay ?? 10;
    dueDate = new Date(
      Date.UTC(input.periodYear, input.periodMonth - 1, dueDay),
    );
  }

  const bill = await prisma.tenantBill.create({
    data: {
      contractId: input.contractId,
      kind: "SERVICES",
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      dueDate,
      rentAmount: 0,
      expensesAmount: 0,
      contractServicesAmount: 0,
      lateFeeAmount: 0,
      otherAmount: 0,
      commissionAmount: 0,
      totalAmount: 0,
      paidAmount: 0,
      currency: contract.currency,
      status: "PENDING",
    },
  });

  await syncBillContractServiceLines(bill.id, { overwrite: true });
  return resyncServiceBillTotals(bill.id);
}

export async function syncOpenBillContractServiceLinesFrom(
  contractId: string,
  fromYear: number,
  fromMonth: number,
) {
  const rentBills = await prisma.tenantBill.findMany({
    where: {
      contractId,
      kind: "RENT",
      status: { in: [...OPEN_BILL_STATUSES] },
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
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
  });

  for (const rentBill of rentBills) {
    const serviceBill = await generateTenantServiceBill({
      contractId,
      periodYear: rentBill.periodYear,
      periodMonth: rentBill.periodMonth,
      dueDate: rentBill.dueDate,
    });
    if (serviceBill) {
      await syncBillContractServiceLines(serviceBill.id, { overwrite: true });
      await resyncServiceBillTotals(serviceBill.id);
    }
  }
}

export async function syncAllOpenBillContractServiceLines(contractId: string) {
  const rentBills = await prisma.tenantBill.findMany({
    where: {
      contractId,
      kind: "RENT",
      status: { in: [...OPEN_BILL_STATUSES] },
    },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
  });

  for (const rentBill of rentBills) {
    await generateTenantServiceBill({
      contractId,
      periodYear: rentBill.periodYear,
      periodMonth: rentBill.periodMonth,
      dueDate: rentBill.dueDate,
    });
  }
}

export async function upsertContractServiceBillLine(input: {
  tenantBillId: string;
  contractServiceId: string;
  concept: string;
  amount: number;
  paidBy: ContractServicePaidBy;
}) {
  const bill = await prisma.tenantBill.findUniqueOrThrow({
    where: { id: input.tenantBillId },
    select: { kind: true },
  });
  if (bill.kind !== "SERVICES") {
    throw new Error("Solo se editan líneas en cuotas de servicios");
  }

  return prisma.tenantBillContractServiceLine.upsert({
    where: {
      tenantBillId_contractServiceId: {
        tenantBillId: input.tenantBillId,
        contractServiceId: input.contractServiceId,
      },
    },
    create: {
      tenantBillId: input.tenantBillId,
      contractServiceId: input.contractServiceId,
      concept: input.concept,
      amount: input.amount,
      paidBy: input.paidBy,
    },
    update: {
      concept: input.concept,
      amount: input.amount,
      paidBy: input.paidBy,
    },
  });
}

export async function getBillContractServiceLinesForDisplay(
  tenantBillId: string,
) {
  const bill = await prisma.tenantBill.findUniqueOrThrow({
    where: { id: tenantBillId },
    include: {
      contractServiceLines: true,
      contract: {
        include: {
          contractServices: {
            where: { active: true, paidBy: "TENANT" },
            orderBy: [{ sortOrder: "asc" }, { concept: "asc" }],
          },
        },
      },
    },
  });

  if (bill.kind !== "SERVICES") return [];

  return resolveBillContractServiceLines(
    bill.contract.contractServices,
    bill.contractServiceLines,
  );
}

export const syncOpenBillsContractServicesFrom =
  syncOpenBillContractServiceLinesFrom;

export async function upsertContractServiceBillOverride(input: {
  tenantBillId: string;
  contractServiceId: string;
  amount: number;
  paidBy: ContractServicePaidBy;
  concept?: string;
}) {
  return upsertContractServiceBillLine({
    tenantBillId: input.tenantBillId,
    contractServiceId: input.contractServiceId,
    concept: input.concept ?? "Servicio",
    amount: input.amount,
    paidBy: input.paidBy,
  });
}

export async function clearContractServiceOverridesFrom(
  contractServiceId: string,
  fromYear: number,
  fromMonth: number,
) {
  const service = await prisma.contractService.findUniqueOrThrow({
    where: { id: contractServiceId },
    select: { contractId: true },
  });

  await syncOpenBillContractServiceLinesFrom(
    service.contractId,
    fromYear,
    fromMonth,
  );
}

export async function syncTenantBillContractServices(billId: string) {
  return resyncServiceBillTotals(billId);
}

export async function findServiceBillForPeriod(
  contractId: string,
  periodYear: number,
  periodMonth: number,
) {
  return prisma.tenantBill.findUnique({
    where: tenantBillPeriodKey({
      contractId,
      periodYear,
      periodMonth,
      kind: "SERVICES",
    }),
  });
}
