import type { Prisma, RecoverableRecoveryMethod } from "@prisma/client";
import { toDateInputValue } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toNumber(value: { toNumber(): number } | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

function statusFromAmounts(amount: number, recovered: number) {
  if (recovered <= 0.009) return "OPEN" as const;
  if (recovered + 0.009 >= amount) return "RECOVERED" as const;
  return "PARTIAL" as const;
}

/**
 * Abre cargos AGENCY_RECOVERABLE prorrateados por ownership al pagar la factura.
 * Idempotente por (supplierInvoiceId, ownerId).
 */
export async function openRecoverableChargesForInvoice(
  tx: Tx,
  organizationId: string,
  supplierInvoiceId: string,
) {
  const inv = await tx.supplierInvoice.findFirst({
    where: {
      id: supplierInvoiceId,
      costBearer: "AGENCY_RECOVERABLE",
      workOrder: { organizationId },
    },
    include: {
      workOrder: {
        select: {
          id: true,
          propertyId: true,
          code: true,
          title: true,
        },
      },
    },
  });
  if (!inv) return;

  const ownerships = await tx.propertyOwnership.findMany({
    where: { propertyId: inv.workOrder.propertyId },
  });
  if (ownerships.length === 0) {
    throw new Error(
      `La propiedad de la OT ${inv.workOrder.code} no tiene propietarios cargados; no se puede abrir el gasto a recuperar.`,
    );
  }

  const totalAmount = toNumber(inv.amount);
  const openedAt = inv.paidAt ?? new Date();

  for (const own of ownerships) {
    const share = Number(own.sharePct) / 100;
    const amount = round2(totalAmount * share);
    if (amount <= 0.009) continue;

    await tx.recoverableCharge.upsert({
      where: {
        supplierInvoiceId_ownerId: {
          supplierInvoiceId: inv.id,
          ownerId: own.ownerId,
        },
      },
      create: {
        organizationId,
        propertyId: inv.workOrder.propertyId,
        ownerId: own.ownerId,
        supplierInvoiceId: inv.id,
        workOrderId: inv.workOrder.id,
        amount,
        currency: inv.currency,
        recoveredAmount: 0,
        status: "OPEN",
        openedAt,
        notes: `OT ${inv.workOrder.code} · ${inv.workOrder.title}`,
      },
      update: {
        amount,
        currency: inv.currency,
        openedAt,
        notes: `OT ${inv.workOrder.code} · ${inv.workOrder.title}`,
      },
    });
  }
}

/**
 * Al desimputar el pago: si hay recuperos, falla; si no, borra los cargos.
 */
export async function reverseRecoverableChargesForInvoice(
  tx: Tx,
  organizationId: string,
  supplierInvoiceId: string,
) {
  const charges = await tx.recoverableCharge.findMany({
    where: { supplierInvoiceId, organizationId },
    include: { _count: { select: { recoveries: true } } },
  });
  if (charges.length === 0) return;

  const withRecoveries = charges.filter((c) => c._count.recoveries > 0);
  if (withRecoveries.length > 0) {
    throw new Error(
      "No se puede desimputar: hay recuperos registrados sobre gastos a recuperar de esta factura. Anulá los recuperos primero.",
    );
  }

  await tx.recoverableCharge.deleteMany({
    where: {
      id: { in: charges.map((c) => c.id) },
      organizationId,
    },
  });
}

/**
 * Revierte recuperos vinculados a una rendición (p. ej. antes de regenerar DRAFT).
 * Resta recoveredAmount y elimina las RecoverableRecovery method=SETTLEMENT.
 */
export async function reverseRecoveriesForSettlement(
  tx: Tx,
  organizationId: string,
  settlementId: string,
) {
  const recoveries = await tx.recoverableRecovery.findMany({
    where: {
      ownerSettlementId: settlementId,
      method: "SETTLEMENT",
      charge: { organizationId },
    },
    include: {
      charge: { select: { id: true, amount: true, recoveredAmount: true } },
    },
  });
  if (recoveries.length === 0) return 0;

  for (const r of recoveries) {
    const recoveredAmount = round2(
      Math.max(0, toNumber(r.charge.recoveredAmount) - toNumber(r.amount)),
    );
    const status = statusFromAmounts(toNumber(r.charge.amount), recoveredAmount);
    await tx.recoverableCharge.update({
      where: { id: r.charge.id },
      data: {
        recoveredAmount,
        status: status === "RECOVERED" ? "RECOVERED" : status,
      },
    });
    await tx.recoverableRecovery.delete({ where: { id: r.id } });
  }
  return recoveries.length;
}

export async function applyRecoverableRecovery(
  tx: Tx,
  input: {
    organizationId: string;
    chargeId: string;
    amount: number;
    recoveredAt: Date;
    method: RecoverableRecoveryMethod;
    notes?: string | null;
    receiptId?: string | null;
    ownerSettlementId?: string | null;
    referenceWorkOrderId?: string | null;
  },
) {
  const amount = round2(input.amount);
  if (amount <= 0.009) {
    throw new Error("El monto de recupero debe ser mayor a cero.");
  }

  const charge = await tx.recoverableCharge.findFirst({
    where: {
      id: input.chargeId,
      organizationId: input.organizationId,
      status: { in: ["OPEN", "PARTIAL"] },
    },
  });
  if (!charge) {
    throw new Error("Cargo a recuperar no encontrado o ya cerrado.");
  }

  const pending = round2(toNumber(charge.amount) - toNumber(charge.recoveredAmount));
  if (amount > pending + 0.009) {
    throw new Error(
      `El recupero (${amount.toFixed(2)}) supera el saldo pendiente (${pending.toFixed(2)}).`,
    );
  }

  await tx.recoverableRecovery.create({
    data: {
      chargeId: charge.id,
      amount,
      recoveredAt: input.recoveredAt,
      method: input.method,
      notes: input.notes?.trim() || null,
      receiptId: input.receiptId || null,
      ownerSettlementId: input.ownerSettlementId || null,
      referenceWorkOrderId: input.referenceWorkOrderId || null,
    },
  });

  const recoveredAmount = round2(toNumber(charge.recoveredAmount) + amount);
  const status = statusFromAmounts(toNumber(charge.amount), recoveredAmount);

  return tx.recoverableCharge.update({
    where: { id: charge.id },
    data: { recoveredAmount, status },
  });
}

export async function getOpenRecoverableBalanceForOwner(
  organizationId: string,
  ownerId: string,
  currency?: string,
) {
  const charges = await prisma.recoverableCharge.findMany({
    where: {
      organizationId,
      ownerId,
      status: { in: ["OPEN", "PARTIAL"] },
      ...(currency ? { currency: currency as "ARS" | "USD" | "EUR" } : {}),
    },
    select: {
      amount: true,
      recoveredAmount: true,
      currency: true,
      propertyId: true,
      property: { select: { title: true } },
    },
  });

  const byCurrency: Record<string, number> = {};
  const byProperty: {
    propertyId: string;
    propertyTitle: string;
    currency: string;
    balance: number;
  }[] = [];

  const propMap = new Map<string, (typeof byProperty)[number]>();

  for (const c of charges) {
    const bal = round2(toNumber(c.amount) - toNumber(c.recoveredAmount));
    if (bal <= 0.009) continue;
    byCurrency[c.currency] = round2((byCurrency[c.currency] ?? 0) + bal);
    const key = `${c.propertyId}:${c.currency}`;
    const existing = propMap.get(key);
    if (existing) {
      existing.balance = round2(existing.balance + bal);
    } else {
      propMap.set(key, {
        propertyId: c.propertyId,
        propertyTitle: c.property.title,
        currency: c.currency,
        balance: bal,
      });
    }
  }

  byProperty.push(...propMap.values());
  const total = Object.values(byCurrency).reduce((a, b) => a + b, 0);

  return {
    total,
    byCurrency,
    byProperty,
    hasOpen: byProperty.length > 0,
  };
}

export type RecoverableSummaryRow = {
  ownerId: string;
  ownerName: string;
  propertyId: string;
  propertyTitle: string;
  currency: string;
  balance: number;
  openCharges: number;
};

export async function listRecoverableAccountSummaries(
  organizationId: string,
): Promise<RecoverableSummaryRow[]> {
  const charges = await prisma.recoverableCharge.findMany({
    where: {
      organizationId,
      status: { in: ["OPEN", "PARTIAL"] },
    },
    include: {
      owner: { select: { id: true, name: true } },
      property: { select: { id: true, title: true } },
    },
    orderBy: [{ owner: { name: "asc" } }, { openedAt: "desc" }],
  });

  const map = new Map<string, RecoverableSummaryRow>();
  for (const c of charges) {
    const bal = round2(toNumber(c.amount) - toNumber(c.recoveredAmount));
    if (bal <= 0.009) continue;
    const key = `${c.ownerId}:${c.propertyId}:${c.currency}`;
    const existing = map.get(key);
    if (existing) {
      existing.balance = round2(existing.balance + bal);
      existing.openCharges += 1;
    } else {
      map.set(key, {
        ownerId: c.owner.id,
        ownerName: c.owner.name,
        propertyId: c.property.id,
        propertyTitle: c.property.title,
        currency: c.currency,
        balance: bal,
        openCharges: 1,
      });
    }
  }

  return [...map.values()].sort((a, b) =>
    a.ownerName.localeCompare(b.ownerName, "es"),
  );
}

export type RecoverableStatementEntry = {
  id: string;
  kind: "charge" | "recovery";
  date: string;
  concept: string;
  amount: number;
  currency: string;
  balanceAfter?: number;
  status?: string;
  method?: string;
  propertyTitle: string;
  workOrderCode: string;
  chargeId: string;
  pending: number;
  chargeAmount: number;
  recoveredAmount: number;
};

export async function getRecoverableAccountStatement(input: {
  organizationId: string;
  ownerId: string;
  propertyId?: string;
}) {
  const charges = await prisma.recoverableCharge.findMany({
    where: {
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
    },
    include: {
      property: { select: { title: true } },
      workOrder: { select: { code: true, title: true } },
      supplierInvoice: {
        select: { invoiceNumber: true, amount: true },
      },
      recoveries: {
        orderBy: { recoveredAt: "asc" },
        include: {
          referenceWorkOrder: { select: { code: true } },
          receipt: { select: { number: true } },
          ownerSettlement: { select: { code: true } },
        },
      },
    },
    orderBy: { openedAt: "asc" },
  });

  const owner = await prisma.user.findUnique({
    where: { id: input.ownerId },
    select: { id: true, name: true, email: true },
  });

  const entries: RecoverableStatementEntry[] = [];
  let openBalance = 0;

  for (const c of charges) {
    const amount = toNumber(c.amount);
    const recovered = toNumber(c.recoveredAmount);
    const pending = round2(amount - recovered);
    openBalance = round2(openBalance + pending);

    entries.push({
      id: c.id,
      kind: "charge",
      date: toDateInputValue(c.openedAt),
      concept: `Gasto a recuperar · ${c.workOrder.code} · ${c.workOrder.title}${
        c.supplierInvoice.invoiceNumber
          ? ` · Fac. ${c.supplierInvoice.invoiceNumber}`
          : ""
      }`,
      amount,
      currency: c.currency,
      status: c.status,
      propertyTitle: c.property.title,
      workOrderCode: c.workOrder.code,
      chargeId: c.id,
      pending,
      chargeAmount: amount,
      recoveredAmount: recovered,
    });

    for (const r of c.recoveries) {
      const ref =
        r.method === "RECEIPT" && r.receipt
          ? ` · Recibo ${r.receipt.number}`
          : r.method === "SETTLEMENT" && r.ownerSettlement
            ? ` · Rendición ${r.ownerSettlement.code}`
            : r.referenceWorkOrder
              ? ` · Ref. OT ${r.referenceWorkOrder.code}`
              : "";
      entries.push({
        id: r.id,
        kind: "recovery",
        date: toDateInputValue(r.recoveredAt),
        concept: `Recupero (${r.method.toLowerCase()})${ref}${
          r.notes ? ` · ${r.notes}` : ""
        }`,
        amount: -toNumber(r.amount),
        currency: c.currency,
        method: r.method,
        propertyTitle: c.property.title,
        workOrderCode: c.workOrder.code,
        chargeId: c.id,
        pending: 0,
        chargeAmount: amount,
        recoveredAmount: recovered,
      });
    }
  }

  const openCharges = charges
    .filter((c) => c.status === "OPEN" || c.status === "PARTIAL")
    .map((c) => ({
      id: c.id,
      propertyId: c.propertyId,
      propertyTitle: c.property.title,
      workOrderCode: c.workOrder.code,
      workOrderTitle: c.workOrder.title,
      currency: c.currency,
      amount: toNumber(c.amount),
      recoveredAmount: toNumber(c.recoveredAmount),
      pending: round2(toNumber(c.amount) - toNumber(c.recoveredAmount)),
      openedAt: toDateInputValue(c.openedAt),
    }))
    .filter((c) => c.pending > 0.009);

  return {
    owner,
    entries,
    openCharges,
    openBalance: round2(
      openCharges.reduce((s, c) => s + c.pending, 0),
    ),
  };
}
