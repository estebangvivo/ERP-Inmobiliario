import { AllocationMethod, ExpenseType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function createExpenseWithAllocations(input: {
  complexId: string;
  type: ExpenseType;
  concept: string;
  periodYear: number;
  periodMonth: number;
  totalAmount: number;
  currency?: "ARS" | "USD" | "EUR";
  allocationMethod?: AllocationMethod;
  billToTenant?: boolean;
  notes?: string;
}) {
  const units = await prisma.unit.findMany({
    where: { complexId: input.complexId },
    include: { complex: { select: { organizationId: true } } },
  });
  if (units.length === 0) {
    throw new Error("El complejo no tiene unidades");
  }
  const complex = units[0]!.complex;

  const method = input.allocationMethod ?? "OWNERSHIP_COEFFICIENT";
  let allocations: { unitId: string; amount: number }[] = [];

  if (method === "FIXED_EQUAL") {
    const each = round2(input.totalAmount / units.length);
    allocations = units.map((u, i) => ({
      unitId: u.id,
      amount:
        i === units.length - 1
          ? round2(input.totalAmount - each * (units.length - 1))
          : each,
    }));
  } else {
    const coeffSum = units.reduce(
      (s, u) => s + Number(u.ownershipCoefficient),
      0,
    );
    if (coeffSum <= 0) throw new Error("Coeficientes inválidos");

    let assigned = 0;
    allocations = units.map((u, i) => {
      if (i === units.length - 1) {
        return {
          unitId: u.id,
          amount: round2(input.totalAmount - assigned),
        };
      }
      const amount = round2(
        (input.totalAmount * Number(u.ownershipCoefficient)) / coeffSum,
      );
      assigned += amount;
      return { unitId: u.id, amount };
    });
  }

  return prisma.expense.create({
    data: {
      organizationId: complex.organizationId,
      complexId: input.complexId,
      type: input.type,
      concept: input.concept,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      totalAmount: input.totalAmount,
      currency: input.currency ?? "ARS",
      allocationMethod: method,
      billToTenant: input.billToTenant ?? input.type === "ORDINARY",
      notes: input.notes || null,
      allocations: { create: allocations },
    },
    include: { allocations: { include: { unit: true } } },
  });
}

export async function listExpenses(filters?: {
  complexId?: string;
  year?: number;
  month?: number;
}) {
  const where: Prisma.ExpenseWhereInput = {};
  if (filters?.complexId) where.complexId = filters.complexId;
  if (filters?.year) where.periodYear = filters.year;
  if (filters?.month) where.periodMonth = filters.month;

  return prisma.expense.findMany({
    where,
    include: {
      complex: true,
      allocations: { include: { unit: true } },
      _count: { select: { allocations: true } },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
}
