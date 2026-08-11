import {
  AllocationMethod,
  CostLedger,
  ExpenseType,
  Prisma,
  ServiceCostCategory,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncOpenBillsForExpensePeriod } from "@/server/services/billing";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const EXPENSE_ORDINARY_CATEGORIES: ServiceCostCategory[] = [
  "WATER",
  "GAS",
  "ELECTRICITY",
  "MUNICIPAL",
  "OTHER",
];

const SERVICE_ORDINARY_CATEGORIES: ServiceCostCategory[] = [
  "WATER",
  "GAS",
  "ELECTRICITY",
  "MUNICIPAL",
  "OTHER",
  "COMMON",
];

function ordinaryCategories(ledger: CostLedger): ServiceCostCategory[] {
  return ledger === "SERVICES"
    ? SERVICE_ORDINARY_CATEGORIES
    : EXPENSE_ORDINARY_CATEGORIES;
}

function ledgerNoun(ledger: CostLedger) {
  return ledger === "SERVICES" ? "servicios" : "expensas";
}

function ordinaryLabel(ledger: CostLedger) {
  return ledger === "SERVICES" ? "Servicios ordinarios" : "Expensas ordinarias";
}

function extraLabel(ledger: CostLedger) {
  return ledger === "SERVICES"
    ? "Servicios extraordinarios (obras)"
    : "Expensas extraordinarias (obras)";
}

/** Concepto de documento por propiedad (para no chocar con el del edificio). */
export function propertyExpenseConcept(
  label: string,
  propertyId: string,
  periodMonth: number,
  periodYear: number,
) {
  return `${label} · prop ${propertyId} ${periodMonth}/${periodYear}`;
}

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
  ledger?: CostLedger;
  /** Si se pasa, usa montos por unidad en lugar de prorrateo genérico. */
  unitAmounts?: { unitId: string; amount: number }[];
}) {
  const ledger = input.ledger ?? "EXPENSES";
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
      ledger,
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
  ledger?: CostLedger;
}) {
  const ledger = input.ledger ?? "EXPENSES";
  const hasComplex = Boolean(input.complexId);
  const hasProperty = Boolean(input.propertyId);
  if (hasComplex === hasProperty) {
    throw new Error("Indicá edificio o propiedad (uno solo).");
  }
  if (!(input.amount > 0)) {
    throw new Error("El monto debe ser positivo.");
  }
  if (input.category === "COMMON" && ledger !== "SERVICES") {
    throw new Error("Gasto común solo aplica en el módulo Servicios.");
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
      ledger,
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
 * Genera expensas/servicios del período a partir de gastos de un edificio.
 * Base ordinaria = suma gastos de edificio × (m² unidad / m² totales).
 * Si ya hay documentos de edificio emitidos para el período, falla (salvo force).
 */
export async function generateExpensesFromServiceCosts(input: {
  organizationId: string;
  complexId: string;
  periodYear: number;
  periodMonth: number;
  billToTenant?: boolean;
  currency?: "ARS" | "USD" | "EUR";
  ledger?: CostLedger;
  /** Regenera aunque ya existan documentos del período. */
  force?: boolean;
}) {
  const currency = input.currency ?? "ARS";
  const ledger = input.ledger ?? "EXPENSES";
  const noun = ledgerNoun(ledger);

  const units = await prisma.unit.findMany({
    where: { complexId: input.complexId },
    include: {
      property: { select: { id: true, areaM2: true } },
    },
  });
  if (units.length === 0) {
    throw new Error("El edificio no tiene unidades/propiedades.");
  }

  const already = await prisma.expense.findFirst({
    where: {
      complexId: input.complexId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      ledger,
      NOT: { concept: { contains: " · prop " } },
    },
    select: { id: true },
  });
  if (already && !input.force) {
    throw new Error(
      `Ya hay ${noun} de edificio emitidos para ${input.periodMonth}/${input.periodYear}. Eliminalos antes de volver a generar.`,
    );
  }
  if (already && input.force) {
    const old = await prisma.expense.findMany({
      where: {
        complexId: input.complexId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        ledger,
        NOT: { concept: { contains: " · prop " } },
      },
      select: { id: true },
    });
    await prisma.expenseAllocation.deleteMany({
      where: { expenseId: { in: old.map((e) => e.id) } },
    });
    await prisma.expense.deleteMany({
      where: { id: { in: old.map((e) => e.id) } },
    });
  }

  const propertyIds = units
    .map((u) => u.property?.id)
    .filter((id): id is string => Boolean(id));

  // Propiedades ya generadas en forma individual: no sumar de nuevo
  const propertyDocs = propertyIds.length
    ? await prisma.expense.findMany({
        where: {
          complexId: input.complexId,
          periodYear: input.periodYear,
          periodMonth: input.periodMonth,
          ledger,
          OR: propertyIds.map((id) => ({
            concept: { contains: ` · prop ${id} ` },
          })),
        },
        select: { concept: true },
      })
    : [];
  const skipPropertyIds = new Set(
    propertyDocs
      .map((d) => {
        const m = d.concept.match(/ · prop ([^\s]+) /);
        return m?.[1] ?? null;
      })
      .filter((id): id is string => Boolean(id)),
  );

  const costs = await prisma.serviceCost.findMany({
    where: {
      organizationId: input.organizationId,
      ledger,
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

  const usableCosts = costs.filter(
    (c) => !c.propertyId || !skipPropertyIds.has(c.propertyId),
  );

  if (usableCosts.length === 0) {
    throw new Error(
      `No hay gastos de ${noun} cargados para ese período (o ya se generaron por propiedad).`,
    );
  }

  const areaProbe = allocateByAreaM2(0, units);
  const totalArea = areaProbe.reduce((s, a) => s + a.areaM2, 0);
  const results = [];

  for (const bucket of [
    {
      type: "ORDINARY" as const,
      categories: ordinaryCategories(ledger),
      label: ordinaryLabel(ledger),
    },
    {
      type: "EXTRAORDINARY" as const,
      categories: ["WORKS" as const],
      label: extraLabel(ledger),
    },
  ]) {
    const bucketCosts = usableCosts.filter((c) =>
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

    const unitAmounts = unitAmountsDraft.filter((a) => a.amount > 0.009);
    if (unitAmounts.length === 0) continue;

    const concept = `${bucket.label} ${input.periodMonth}/${input.periodYear}`;

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
        ledger,
        billToTenant: input.billToTenant ?? true,
        unitAmounts,
        notes,
      }),
    );
  }

  if (results.length === 0) {
    throw new Error(`No se generaron ${noun}: sin montos aplicables.`);
  }

  return results;
}

/**
 * Genera expensas/servicios solo con los gastos cargados a una propiedad.
 */
export async function generateExpensesForProperty(input: {
  organizationId: string;
  propertyId: string;
  periodYear: number;
  periodMonth: number;
  billToTenant?: boolean;
  currency?: "ARS" | "USD" | "EUR";
  ledger?: CostLedger;
  force?: boolean;
}) {
  const currency = input.currency ?? "ARS";
  const ledger = input.ledger ?? "EXPENSES";
  const noun = ledgerNoun(ledger);

  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, organizationId: input.organizationId },
    include: {
      unit: { select: { id: true, complexId: true, code: true, areaM2: true } },
    },
  });
  if (!property) throw new Error("Propiedad no encontrada.");
  if (!property.unit) {
    throw new Error(
      "La propiedad no está vinculada a una unidad de edificio. Asociála en Edificios.",
    );
  }

  const unit = property.unit;
  const costs = await prisma.serviceCost.findMany({
    where: {
      organizationId: input.organizationId,
      ledger,
      propertyId: input.propertyId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      currency,
    },
  });
  if (costs.length === 0) {
    throw new Error(
      `No hay gastos de ${noun} cargados a esta propiedad para ese período.`,
    );
  }

  // Cubierto por generación de edificio
  const buildingDoc = await prisma.expense.findFirst({
    where: {
      complexId: unit.complexId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      ledger,
      NOT: { concept: { contains: " · prop " } },
    },
    select: { id: true },
  });
  if (buildingDoc && !input.force) {
    throw new Error(
      `Este período ya tiene ${noun} de edificio que incluyen la propiedad. No hace falta generarla aparte.`,
    );
  }

  const results = [];
  for (const bucket of [
    {
      type: "ORDINARY" as const,
      categories: ordinaryCategories(ledger),
      label: ordinaryLabel(ledger),
    },
    {
      type: "EXTRAORDINARY" as const,
      categories: ["WORKS" as const],
      label: extraLabel(ledger),
    },
  ]) {
    const bucketCosts = costs.filter((c) =>
      bucket.categories.includes(c.category as never),
    );
    if (bucketCosts.length === 0) continue;
    const amount = round2(
      bucketCosts.reduce((s, c) => s + Number(c.amount), 0),
    );
    if (!(amount > 0)) continue;

    const concept = propertyExpenseConcept(
      bucket.label,
      input.propertyId,
      input.periodMonth,
      input.periodYear,
    );

    const existing = await prisma.expense.findFirst({
      where: {
        complexId: unit.complexId,
        concept,
        ledger,
      },
      select: { id: true },
    });
    if (existing && !input.force) {
      throw new Error(
        `Ya hay ${noun} emitidos para esta propiedad en ${input.periodMonth}/${input.periodYear}.`,
      );
    }
    if (existing && input.force) {
      await prisma.expenseAllocation.deleteMany({
        where: { expenseId: existing.id },
      });
      await prisma.expense.delete({ where: { id: existing.id } });
    }

    results.push(
      await createExpenseWithAllocations({
        complexId: unit.complexId,
        type: bucket.type,
        concept,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        totalAmount: amount,
        currency,
        ledger,
        billToTenant: input.billToTenant ?? true,
        unitAmounts: [{ unitId: unit.id, amount }],
        notes: [
          `Propiedad ${property.title} · unidad ${unit.code}`,
          ...bucketCosts.map(
            (c) => `${c.category}: ${Number(c.amount).toFixed(2)}`,
          ),
        ].join("\n"),
      }),
    );
  }

  if (results.length === 0) {
    throw new Error(`No se generaron ${noun} para la propiedad.`);
  }
  return results;
}

/**
 * Genera todos los edificios y propiedades con gastos cargados
 * que aún no tienen documentos del período.
 */
export async function generateAllPendingFromServiceCosts(input: {
  organizationId: string;
  periodYear: number;
  periodMonth: number;
  billToTenant?: boolean;
  currency?: "ARS" | "USD" | "EUR";
  ledger?: CostLedger;
}) {
  const currency = input.currency ?? "ARS";
  const ledger = input.ledger ?? "EXPENSES";
  const noun = ledgerNoun(ledger);

  const costs = await prisma.serviceCost.findMany({
    where: {
      organizationId: input.organizationId,
      ledger,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      currency,
    },
    select: { complexId: true, propertyId: true },
  });
  if (costs.length === 0) {
    throw new Error(`No hay gastos de ${noun} cargados para ese período.`);
  }

  const complexIds = new Set(
    costs.map((c) => c.complexId).filter((id): id is string => Boolean(id)),
  );
  const propertyIds = [
    ...new Set(
      costs.map((c) => c.propertyId).filter((id): id is string => Boolean(id)),
    ),
  ];

  if (propertyIds.length) {
    const props = await prisma.property.findMany({
      where: { id: { in: propertyIds } },
      select: { id: true, unit: { select: { complexId: true } } },
    });
    for (const p of props) {
      if (p.unit?.complexId) complexIds.add(p.unit.complexId);
    }
  }

  const created = [];
  const errors: string[] = [];

  for (const complexId of complexIds) {
    try {
      const docs = await generateExpensesFromServiceCosts({
        ...input,
        complexId,
        currency,
        ledger,
      });
      created.push(...docs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      // Si ya estaban emitidos o solo quedan props individuales, seguimos
      if (!/Ya hay/.test(msg) && !/No hay gastos/.test(msg)) {
        errors.push(`Edificio ${complexId.slice(-6)}: ${msg}`);
      }
    }
  }

  for (const propertyId of propertyIds) {
    try {
      const docs = await generateExpensesForProperty({
        ...input,
        propertyId,
        currency,
        ledger,
      });
      created.push(...docs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      if (
        !/Ya hay/.test(msg) &&
        !/No hay gastos/.test(msg) &&
        !/ya tiene/.test(msg)
      ) {
        errors.push(`Propiedad ${propertyId.slice(-6)}: ${msg}`);
      }
    }
  }

  if (created.length === 0) {
    throw new Error(
      errors[0] ??
        `No quedó nada pendiente: los ${noun} del período ya estaban generados o no hay gastos aplicables.`,
    );
  }

  return { created, errors };
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
        EXPENSE_ORDINARY_CATEGORIES.includes(c.category),
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
