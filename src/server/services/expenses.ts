import {
  AllocationMethod,
  ExpenseType,
  Prisma,
  ServiceCostCategory,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncOpenBillsForExpensePeriod } from "@/server/services/billing";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const ORDINARY_CATEGORIES: ServiceCostCategory[] = [
  "WATER",
  "GAS",
  "ELECTRICITY",
  "MUNICIPAL",
  "OTHER",
];

/** m² de la unidad: prioriza Unit.areaM2 y luego Property.areaM2. */
function resolveUnitAreaM2(unit: {
  code: string;
  areaM2: Prisma.Decimal | number | null;
  property?: { areaM2: Prisma.Decimal | number | null } | null;
}): number {
  const fromUnit = unit.areaM2 != null ? Number(unit.areaM2) : 0;
  if (fromUnit > 0) return fromUnit;
  const fromProperty =
    unit.property?.areaM2 != null ? Number(unit.property.areaM2) : 0;
  if (fromProperty > 0) return fromProperty;
  return 0;
}

/**
 * Prorratea un monto del edificio por m² de cada unidad.
 * Última unidad absorbe el residual de redondeo.
 */
function allocateByAreaM2(
  totalAmount: number,
  units: {
    id: string;
    code: string;
    areaM2: Prisma.Decimal | number | null;
    property?: { areaM2: Prisma.Decimal | number | null } | null;
  }[],
): { unitId: string; amount: number; areaM2: number }[] {
  const withArea = units.map((u) => ({
    unitId: u.id,
    code: u.code,
    areaM2: resolveUnitAreaM2(u),
  }));
  const missing = withArea.filter((u) => !(u.areaM2 > 0));
  if (missing.length > 0) {
    throw new Error(
      `Falta la superficie (m²) en: ${missing.map((u) => u.code).join(", ")}. Cargala en la unidad o en la propiedad.`,
    );
  }
  const totalArea = withArea.reduce((s, u) => s + u.areaM2, 0);
  if (!(totalArea > 0)) {
    throw new Error("La suma de metros cuadrados del edificio es 0.");
  }

  let assigned = 0;
  return withArea.map((u, i) => {
    if (i === withArea.length - 1) {
      return {
        unitId: u.unitId,
        areaM2: u.areaM2,
        amount: round2(totalAmount - assigned),
      };
    }
    const amount = round2((totalAmount * u.areaM2) / totalArea);
    assigned += amount;
    return { unitId: u.unitId, areaM2: u.areaM2, amount };
  });
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
  /** Si se pasa, usa montos por unidad en lugar de prorrateo genérico. */
  unitAmounts?: { unitId: string; amount: number }[];
}) {
  const units = await prisma.unit.findMany({
    where: { complexId: input.complexId },
    include: {
      complex: { select: { organizationId: true } },
      property: { select: { areaM2: true } },
    },
  });
  if (units.length === 0) {
    throw new Error("El edificio no tiene unidades");
  }
  const complex = units[0]!.complex;

  const method = input.allocationMethod ?? "OWNERSHIP_COEFFICIENT";
  let allocations: { unitId: string; amount: number }[] = [];

  if (input.unitAmounts && input.unitAmounts.length > 0) {
    allocations = input.unitAmounts.map((a) => ({
      unitId: a.unitId,
      amount: round2(a.amount),
    }));
  } else if (method === "FIXED_EQUAL") {
    const each = round2(input.totalAmount / units.length);
    allocations = units.map((u, i) => ({
      unitId: u.id,
      amount:
        i === units.length - 1
          ? round2(input.totalAmount - each * (units.length - 1))
          : each,
    }));
  } else {
    // OWNERSHIP_COEFFICIENT / FIXED_AMOUNT: prorrateo por m² sobre el total del edificio
    allocations = allocateByAreaM2(input.totalAmount, units).map((a) => ({
      unitId: a.unitId,
      amount: a.amount,
    }));
  }

  const totalAmount =
    input.unitAmounts && input.unitAmounts.length > 0
      ? round2(allocations.reduce((s, a) => s + a.amount, 0))
      : input.totalAmount;

  const expense = await prisma.expense.create({
    data: {
      organizationId: complex.organizationId,
      complexId: input.complexId,
      type: input.type,
      concept: input.concept,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      totalAmount,
      currency: input.currency ?? "ARS",
      allocationMethod:
        input.unitAmounts && input.unitAmounts.length > 0
          ? "FIXED_EQUAL"
          : method,
      billToTenant: input.billToTenant ?? input.type === "ORDINARY",
      notes: input.notes || null,
      allocations: { create: allocations },
    },
    include: { allocations: { include: { unit: true } } },
  });

  if (expense.billToTenant) {
    await syncOpenBillsForExpensePeriod({
      complexId: input.complexId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
    });
  }

  return expense;
}

export async function createServiceCost(input: {
  organizationId: string;
  complexId?: string | null;
  propertyId?: string | null;
  category: ServiceCostCategory;
  concept: string;
  periodYear: number;
  periodMonth: number;
  amount: number;
  currency?: "ARS" | "USD" | "EUR";
  notes?: string;
}) {
  const hasComplex = Boolean(input.complexId);
  const hasProperty = Boolean(input.propertyId);
  if (hasComplex === hasProperty) {
    throw new Error("Indicá edificio o propiedad (uno solo).");
  }
  if (!(input.amount > 0)) {
    throw new Error("El monto debe ser positivo.");
  }

  if (input.complexId) {
    const complex = await prisma.complex.findFirst({
      where: { id: input.complexId, organizationId: input.organizationId },
    });
    if (!complex) throw new Error("Edificio no encontrado.");
  }

  if (input.propertyId) {
    const property = await prisma.property.findFirst({
      where: { id: input.propertyId, organizationId: input.organizationId },
    });
    if (!property) throw new Error("Propiedad no encontrada.");
  }

  return prisma.serviceCost.create({
    data: {
      organizationId: input.organizationId,
      complexId: input.complexId || null,
      propertyId: input.propertyId || null,
      category: input.category,
      concept: input.concept,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      amount: input.amount,
      currency: input.currency ?? "ARS",
      notes: input.notes || null,
    },
  });
}

export async function deleteServiceCost(
  organizationId: string,
  serviceCostId: string,
) {
  const existing = await prisma.serviceCost.findFirst({
    where: { id: serviceCostId, organizationId },
  });
  if (!existing) throw new Error("Gasto no encontrado.");
  await prisma.serviceCost.delete({ where: { id: serviceCostId } });
}

/**
 * Genera expensas del período a partir de gastos de servicios/obras.
 * Base ordinaria = suma gastos de edificio × (m² unidad / m² totales del edificio).
 * Gastos por propiedad se suman solo a esa unidad.
 * Obras → expensa extraordinaria (mismo criterio).
 */
export async function generateExpensesFromServiceCosts(input: {
  organizationId: string;
  complexId: string;
  periodYear: number;
  periodMonth: number;
  billToTenant?: boolean;
  currency?: "ARS" | "USD" | "EUR";
}) {
  const currency = input.currency ?? "ARS";
  const units = await prisma.unit.findMany({
    where: { complexId: input.complexId },
    include: {
      property: { select: { id: true, areaM2: true } },
    },
  });
  if (units.length === 0) {
    throw new Error("El edificio no tiene unidades/propiedades.");
  }

  const propertyIds = units
    .map((u) => u.property?.id)
    .filter((id): id is string => Boolean(id));

  const costs = await prisma.serviceCost.findMany({
    where: {
      organizationId: input.organizationId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      currency,
      OR: [
        { complexId: input.complexId },
        ...(propertyIds.length
          ? [{ propertyId: { in: propertyIds } }]
          : []),
      ],
    },
  });

  if (costs.length === 0) {
    throw new Error("No hay gastos de servicios/obras para ese período.");
  }

  // Valida m² antes de generar (también se usa el total en las notas)
  const areaProbe = allocateByAreaM2(0, units);
  const totalArea = areaProbe.reduce((s, a) => s + a.areaM2, 0);
  const results = [];

  for (const bucket of [
    {
      type: "ORDINARY" as const,
      categories: ORDINARY_CATEGORIES,
      label: "Expensas ordinarias",
    },
    {
      type: "EXTRAORDINARY" as const,
      categories: ["WORKS" as const],
      label: "Expensas extraordinarias (obras)",
    },
  ]) {
    const bucketCosts = costs.filter((c) =>
      bucket.categories.includes(c.category as never),
    );
    if (bucketCosts.length === 0) continue;

    const buildingSum = bucketCosts
      .filter((c) => c.complexId === input.complexId)
      .reduce((s, c) => s + Number(c.amount), 0);

    const buildingAlloc = allocateByAreaM2(buildingSum, units);
    const buildingByUnit = new Map(
      buildingAlloc.map((a) => [a.unitId, a.amount]),
    );

    const unitAmountsDraft = units.map((u) => {
      const propCosts = bucketCosts
        .filter((c) => c.propertyId && c.propertyId === u.property?.id)
        .reduce((s, c) => s + Number(c.amount), 0);
      return {
        unitId: u.id,
        amount: round2((buildingByUnit.get(u.id) ?? 0) + propCosts),
      };
    });

    // Ajuste residual para que la suma iguale edificio + gastos por propiedad
    if (unitAmountsDraft.length > 0) {
      const propTotal = bucketCosts
        .filter((c) => c.propertyId)
        .reduce((s, c) => s + Number(c.amount), 0);
      const expected = round2(buildingSum + propTotal);
      const assigned = round2(
        unitAmountsDraft.reduce((s, a) => s + a.amount, 0),
      );
      const diff = round2(expected - assigned);
      const last = unitAmountsDraft[unitAmountsDraft.length - 1]!;
      last.amount = round2(Math.max(0, last.amount + diff));
    }

    const unitAmounts = unitAmountsDraft;

    const concept = `${bucket.label} ${input.periodMonth}/${input.periodYear}`;
    const existing = await prisma.expense.findFirst({
      where: {
        complexId: input.complexId,
        type: bucket.type,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        concept,
      },
    });
    if (existing) {
      await prisma.expenseAllocation.deleteMany({
        where: { expenseId: existing.id },
      });
      await prisma.expense.delete({ where: { id: existing.id } });
    }

    const shareNotes = buildingAlloc
      .map((a) => {
        const unit = units.find((u) => u.id === a.unitId);
        const pct =
          totalArea > 0 ? ((a.areaM2 / totalArea) * 100).toFixed(2) : "0";
        return `${unit?.code ?? a.unitId}: ${a.areaM2} m² (${pct}%) → ${a.amount.toFixed(2)}`;
      })
      .join("; ");

    const notes = [
      `Base edificio: ${buildingSum.toFixed(2)} prorrateado por m² (total ${totalArea} m²)`,
      shareNotes,
      ...bucketCosts.map(
        (c) =>
          `${c.category}: ${Number(c.amount).toFixed(2)}${c.complexId ? " (edificio)" : " (propiedad)"}`,
      ),
    ].join("\n");

    results.push(
      await createExpenseWithAllocations({
        complexId: input.complexId,
        type: bucket.type,
        concept,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        totalAmount: unitAmounts.reduce((s, a) => s + a.amount, 0),
        currency,
        billToTenant: input.billToTenant ?? true,
        unitAmounts,
        notes,
      }),
    );
  }

  return results;
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

export async function previewServiceCostBase(input: {
  organizationId: string;
  complexId: string;
  periodYear: number;
  periodMonth: number;
  currency?: "ARS" | "USD" | "EUR";
}) {
  const currency = input.currency ?? "ARS";
  const units = await prisma.unit.findMany({
    where: { complexId: input.complexId },
    include: {
      property: { select: { id: true, title: true, areaM2: true } },
    },
  });
  const propertyIds = units
    .map((u) => u.property?.id)
    .filter((id): id is string => Boolean(id));

  const costs = await prisma.serviceCost.findMany({
    where: {
      organizationId: input.organizationId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      currency,
      OR: [
        { complexId: input.complexId },
        ...(propertyIds.length
          ? [{ propertyId: { in: propertyIds } }]
          : []),
      ],
    },
  });

  const ordinaryBuilding = costs
    .filter(
      (c) =>
        c.complexId === input.complexId &&
        ORDINARY_CATEGORIES.includes(c.category),
    )
    .reduce((s, c) => s + Number(c.amount), 0);

  let totalAreaM2 = 0;
  try {
    totalAreaM2 = allocateByAreaM2(0, units).reduce((s, a) => s + a.areaM2, 0);
  } catch {
    totalAreaM2 = 0;
  }

  return {
    unitCount: units.length,
    totalAreaM2,
    ordinaryBuildingTotal: ordinaryBuilding,
    /** @deprecated Igual por unidad; preferir prorrateo por m². */
    basePerUnit: units.length ? round2(ordinaryBuilding / units.length) : 0,
    costCount: costs.length,
  };
}
