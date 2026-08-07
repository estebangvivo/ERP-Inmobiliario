"use server";

import { revalidatePath } from "next/cache";
import type { SaleDealStage } from "@prisma/client";
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
      currency: property.currency,
      notes: notes || null,
      leadId: leadId || null,
      assigneeId: session.user.id,
      reservedAt: stage === "RESERVED" ? new Date() : null,
      closedAt: stage === "SOLD" || stage === "LOST" ? new Date() : null,
    },
  });

  await syncPropertyForStage(propertyId, stage, deal.id);

  revalidatePath("/ventas");
  revalidatePath("/gestion/propiedades");
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

  await prisma.saleDeal.update({
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

  revalidatePath("/ventas");
  revalidatePath(`/ventas/${dealId}`);
  revalidatePath("/gestion/propiedades");
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
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id || !buyerName) {
    return { ok: false, error: "Datos incompletos." };
  }

  const deal = await prisma.saleDeal.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!deal) return { ok: false, error: "Oportunidad no encontrada." };

  await prisma.saleDeal.update({
    where: { id },
    data: {
      buyerName,
      buyerEmail: buyerEmail || null,
      buyerPhone: buyerPhone || null,
      stage,
      offerAmount: offerAmount && offerAmount > 0 ? offerAmount : null,
      reservationAmount:
        reservationAmount && reservationAmount > 0 ? reservationAmount : null,
      notes: notes || null,
      reservedAt:
        stage === "RESERVED" ? deal.reservedAt ?? new Date() : deal.reservedAt,
      closedAt:
        stage === "SOLD" || stage === "LOST" ? new Date() : deal.closedAt,
    },
  });

  await syncPropertyForStage(deal.propertyId, stage, id);

  revalidatePath("/ventas");
  revalidatePath(`/ventas/${id}`);
  revalidatePath("/gestion/propiedades");
  return { ok: true };
}
