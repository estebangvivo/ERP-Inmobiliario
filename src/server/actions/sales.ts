"use server";

import { revalidatePath } from "next/cache";
import type { Currency, SaleDealStage } from "@prisma/client";
import { toDateInputValue, parseDateInput } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import type { ActionResult } from "@/server/actions/users";

const STAGES: SaleDealStage[] = [
  "LEAD",
  "NEGOTIATION",
  "RESERVED",
  "SOLD",
  "LOST",
];

function saleDealMarker(dealId: string, kind: "reservation" | "commission") {
  return `saleDeal:${dealId}:${kind}`;
}

type EnsureReceiptResult = {
  number: string | null;
  warning?: string;
};

async function ensureSaleDealReceipt(input: {
  organizationId: string;
  dealId: string;
  kind: "reservation" | "commission";
  partyName: string;
  amount: number;
  currency: Currency;
  propertyId: string;
  description: string;
  concept: string;
}): Promise<EnsureReceiptResult> {
  if (!(input.amount > 0)) return { number: null };

  const label = input.kind === "reservation" ? "seña" : "comisión";
  const marker = saleDealMarker(input.dealId, input.kind);
  const existing = await prisma.receipt.findFirst({
    where: {
      organizationId: input.organizationId,
      notes: { contains: marker },
      status: { not: "CANCELLED" },
    },
    select: { id: true, number: true, status: true },
  });
  if (existing) {
    if (existing.status === "DRAFT") {
      return {
        number: existing.number,
        warning: `El recibo de ${label} ${existing.number} quedó en borrador. Abrí caja en ${input.currency} e imputalo en Tesorería.`,
      };
    }
    return { number: existing.number };
  }

  const { createReceipt } = await import(
    "@/features/treasury/actions/treasury-actions"
  );
  const result = await createReceipt({
    issueDate: toDateInputValue(new Date()),
    partyName: input.partyName,
    concept: input.concept,
    currency: input.currency,
    // Efectivo: no exige cuenta bancaria; el usuario puede reimputar después.
    paymentMethod: "CASH",
    notes: marker,
    lines: [
      {
        propertyId: input.propertyId,
        description: input.description,
        amount: input.amount,
      },
    ],
  });
  if (!result.ok) {
    console.warn("SaleDeal receipt failed", input.kind, result.error);
    return {
      number: null,
      warning: `No se pudo emitir el recibo de ${label}: ${result.error}`,
    };
  }
  if (result.postError) {
    return {
      number: result.number,
      warning: `Se emitió el recibo de ${label} ${result.number} en borrador: ${result.postError}. Imputalo en Tesorería cuando haya caja abierta en ${input.currency}.`,
    };
  }
  return { number: result.number };
}

async function syncSaleDealTreasury(deal: {
  id: string;
  organizationId: string;
  buyerName: string;
  propertyId: string;
  currency: Currency;
  reservationPaid: boolean;
  reservationAmount: { toString(): string } | null;
  commissionAmount: { toString(): string } | null;
  stage: SaleDealStage;
}) {
  const warnings: string[] = [];

  if (deal.reservationPaid && deal.reservationAmount) {
    const amount = Number(deal.reservationAmount);
    if (amount > 0) {
      const result = await ensureSaleDealReceipt({
        organizationId: deal.organizationId,
        dealId: deal.id,
        kind: "reservation",
        partyName: deal.buyerName,
        amount,
        currency: deal.currency,
        propertyId: deal.propertyId,
        concept: "Seña de venta",
        description: `Seña · oportunidad ${deal.id.slice(-6)}`,
      });
      if (result.warning) warnings.push(result.warning);
    }
  }

  if (deal.stage === "SOLD" && deal.commissionAmount) {
    const amount = Number(deal.commissionAmount);
    if (amount > 0) {
      const result = await ensureSaleDealReceipt({
        organizationId: deal.organizationId,
        dealId: deal.id,
        kind: "commission",
        partyName: deal.buyerName,
        amount,
        currency: deal.currency,
        propertyId: deal.propertyId,
        concept: "Comisión por venta",
        description: `Comisión venta · oportunidad ${deal.id.slice(-6)}`,
      });
      if (result.warning) warnings.push(result.warning);
    }
  }

  return warnings;
}

async function syncPropertyForStage(
  propertyId: string,
  stage: SaleDealStage,
  excludeDealId?: string,
) {
  if (stage === "RESERVED") {
    await prisma.property.update({
      where: { id: propertyId },
      data: { status: "RESERVED" },
    });
    return;
  }
  if (stage === "SOLD") {
    await prisma.property.update({
      where: { id: propertyId },
      data: { status: "SOLD" },
    });
    return;
  }
  if (stage === "LOST") {
    const otherReserved = await prisma.saleDeal.findFirst({
      where: {
        propertyId,
        stage: "RESERVED",
        ...(excludeDealId ? { id: { not: excludeDealId } } : {}),
      },
      select: { id: true },
    });
    if (!otherReserved) {
      const prop = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { status: true },
      });
      if (prop?.status === "RESERVED") {
        await prisma.property.update({
          where: { id: propertyId },
          data: { status: "AVAILABLE" },
        });
      }
    }
  }
}

export async function createSaleDealAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const propertyId = String(formData.get("propertyId") ?? "");
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerEmail = String(formData.get("buyerEmail") ?? "").trim();
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim();
  const stage = String(formData.get("stage") ?? "LEAD") as SaleDealStage;
  const offerAmount = formData.get("offerAmount")
    ? Number(formData.get("offerAmount"))
    : null;
  const reservationAmount = formData.get("reservationAmount")
    ? Number(formData.get("reservationAmount"))
    : null;
  const commissionPct = formData.get("commissionPct")
    ? Number(formData.get("commissionPct"))
    : null;
  const deedDate = String(formData.get("deedDate") ?? "").trim();
  const reservationPaid = formData.get("reservationPaid") === "on";
  const notes = String(formData.get("notes") ?? "").trim();
  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!propertyId || !buyerName) {
    return { ok: false, error: "Propiedad y comprador son obligatorios." };
  }
  if (!STAGES.includes(stage)) {
    return { ok: false, error: "Etapa inválida." };
  }

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      organizationId: session.organizationId,
      operationType: { in: ["SALE", "BOTH"] },
    },
  });
  if (!property) {
    return { ok: false, error: "Propiedad de venta no encontrada." };
  }
  if (
    property.status === "RESERVED" ||
    property.status === "SOLD" ||
    property.status === "INACTIVE"
  ) {
    return {
      ok: false,
      error:
        "Esa propiedad no está disponible (reservada, vendida o inactiva). Elegí otra.",
    };
  }

  const parsedDeedDate = deedDate ? parseDateInput(deedDate) : null;
  if (deedDate && !parsedDeedDate) {
    return { ok: false, error: "Fecha de boleto inválida." };
  }

  const deal = await prisma.saleDeal.create({
    data: {
      organizationId: session.organizationId,
      propertyId,
      buyerName,
      buyerEmail: buyerEmail || null,
      buyerPhone: buyerPhone || null,
      stage,
      offerAmount: offerAmount && offerAmount > 0 ? offerAmount : null,
      reservationAmount:
        reservationAmount && reservationAmount > 0 ? reservationAmount : null,
      reservationPaid,
      commissionPct: commissionPct && commissionPct > 0 ? commissionPct : null,
      commissionAmount:
        commissionPct && commissionPct > 0 && offerAmount && offerAmount > 0
          ? Math.round(((offerAmount * commissionPct) / 100) * 100) / 100
          : null,
      deedDate: parsedDeedDate,
      currency: property.currency,
      notes: notes || null,
      leadId: leadId || null,
      assigneeId: session.user.id,
      reservedAt: stage === "RESERVED" ? new Date() : null,
      closedAt: stage === "SOLD" || stage === "LOST" ? new Date() : null,
    },
  });

  await syncPropertyForStage(propertyId, stage, deal.id);
  const warnings = await syncSaleDealTreasury(deal);

  revalidatePath("/ventas");
  revalidatePath("/gestion/propiedades");
  revalidatePath("/tesoreria");
  if (warnings.length > 0) {
    return { ok: true, message: warnings.join(" ") };
  }
  return { ok: true };
}

export async function updateSaleDealStageAction(
  dealId: string,
  stage: SaleDealStage,
): Promise<ActionResult> {
  const session = await requireStaff();
  if (!STAGES.includes(stage)) {
    return { ok: false, error: "Etapa inválida." };
  }

  const deal = await prisma.saleDeal.findFirst({
    where: { id: dealId, organizationId: session.organizationId },
  });
  if (!deal) return { ok: false, error: "Oportunidad no encontrada." };

  const updated = await prisma.saleDeal.update({
    where: { id: dealId },
    data: {
      stage,
      reservedAt:
        stage === "RESERVED" ? deal.reservedAt ?? new Date() : deal.reservedAt,
      closedAt:
        stage === "SOLD" || stage === "LOST" ? new Date() : deal.closedAt,
    },
  });

  await syncPropertyForStage(deal.propertyId, stage, dealId);
  const warnings = await syncSaleDealTreasury(updated);

  revalidatePath("/ventas");
  revalidatePath(`/ventas/${dealId}`);
  revalidatePath("/gestion/propiedades");
  revalidatePath("/tesoreria");
  if (warnings.length > 0) {
    return { ok: true, message: warnings.join(" ") };
  }
  return { ok: true };
}

export async function updateSaleDealAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerEmail = String(formData.get("buyerEmail") ?? "").trim();
  const buyerPhone = String(formData.get("buyerPhone") ?? "").trim();
  const stage = String(formData.get("stage") ?? "LEAD") as SaleDealStage;
  const offerAmount = formData.get("offerAmount")
    ? Number(formData.get("offerAmount"))
    : null;
  const reservationAmount = formData.get("reservationAmount")
    ? Number(formData.get("reservationAmount"))
    : null;
  const commissionPct = formData.get("commissionPct")
    ? Number(formData.get("commissionPct"))
    : null;
  const deedDate = String(formData.get("deedDate") ?? "").trim();
  const reservationPaid = formData.get("reservationPaid") === "on";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id || !buyerName) {
    return { ok: false, error: "Datos incompletos." };
  }

  const deal = await prisma.saleDeal.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!deal) return { ok: false, error: "Oportunidad no encontrada." };

  const parsedDeedDate = deedDate ? parseDateInput(deedDate) : null;
  if (deedDate && !parsedDeedDate) {
    return { ok: false, error: "Fecha de boleto inválida." };
  }

  const updated = await prisma.saleDeal.update({
    where: { id },
    data: {
      buyerName,
      buyerEmail: buyerEmail || null,
      buyerPhone: buyerPhone || null,
      stage,
      offerAmount: offerAmount && offerAmount > 0 ? offerAmount : null,
      reservationAmount:
        reservationAmount && reservationAmount > 0 ? reservationAmount : null,
      reservationPaid,
      commissionPct: commissionPct && commissionPct > 0 ? commissionPct : null,
      commissionAmount:
        commissionPct && commissionPct > 0 && offerAmount && offerAmount > 0
          ? Math.round(((offerAmount * commissionPct) / 100) * 100) / 100
          : null,
      deedDate: parsedDeedDate,
      notes: notes || null,
      reservedAt:
        stage === "RESERVED" ? deal.reservedAt ?? new Date() : deal.reservedAt,
      closedAt:
        stage === "SOLD" || stage === "LOST" ? new Date() : deal.closedAt,
    },
  });

  await syncPropertyForStage(deal.propertyId, stage, id);
  const warnings = await syncSaleDealTreasury(updated);

  revalidatePath("/ventas");
  revalidatePath(`/ventas/${id}`);
  revalidatePath("/gestion/propiedades");
  revalidatePath("/tesoreria");
  if (warnings.length > 0) {
    return { ok: true, message: warnings.join(" ") };
  }
  return { ok: true };
}
