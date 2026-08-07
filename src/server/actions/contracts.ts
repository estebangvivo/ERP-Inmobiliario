"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import {
  contractCreateSchema,
  contractUpdateSchema,
} from "@/server/validators/contract";
import { applyContractAdjustment, recordPayment } from "@/server/services/billing";
import type { ActionResult } from "@/server/actions/users";

function formDataToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function nextContractCode(organizationId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.contract.count({
    where: {
      organizationId,
      code: { startsWith: `CTR-${year}-` },
    },
  });
  return `CTR-${year}-${String(count + 1).padStart(3, "0")}`;
}

async function ensureOwnerOwnership(propertyId: string, ownerId: string) {
  const existing = await prisma.propertyOwnership.findMany({
    where: { propertyId },
  });

  const already = existing.find((o) => o.ownerId === ownerId);
  if (already) {
    if (!already.isPrimary && existing.every((o) => !o.isPrimary)) {
      await prisma.propertyOwnership.update({
        where: { id: already.id },
        data: { isPrimary: true },
      });
    }
    return;
  }

  if (existing.length === 0) {
    await prisma.propertyOwnership.create({
      data: {
        propertyId,
        ownerId,
        sharePct: 100,
        isPrimary: true,
      },
    });
    return;
  }

  await prisma.propertyOwnership.create({
    data: {
      propertyId,
      ownerId,
      sharePct: 0,
      isPrimary: false,
    },
  });
}

async function syncPropertyStatusForContract(
  propertyId: string,
  newStatus: string,
  excludeContractId?: string,
) {
  if (newStatus === "ACTIVE") {
    await prisma.property.update({
      where: { id: propertyId },
      data: { status: "RENTED" },
    });
    return;
  }

  if (newStatus === "TERMINATED" || newStatus === "EXPIRED") {
    const otherActive = await prisma.contract.findFirst({
      where: {
        propertyId,
        status: "ACTIVE",
        ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
      },
      select: { id: true },
    });
    if (!otherActive) {
      await prisma.property.update({
        where: { id: propertyId },
        data: { status: "AVAILABLE" },
      });
    }
  }
}

export async function createContractAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const raw = formDataToObject(formData);
  const parsed = contractCreateSchema.safeParse({
    ...raw,
    includesOrdinaryExp:
      formData.get("includesOrdinaryExp") === "on" ||
      formData.get("includesOrdinaryExp") === "true",
    includesExtraordExp:
      formData.get("includesExtraordExp") === "on" ||
      formData.get("includesExtraordExp") === "true",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const d = parsed.data;
  if (new Date(d.endDate) <= new Date(d.startDate)) {
    return { ok: false, error: "La fecha de fin debe ser posterior al inicio" };
  }

  const code = await nextContractCode(session.organizationId);

  const property = await prisma.property.findFirst({
    where: { id: d.propertyId, organizationId: session.organizationId },
  });
  if (!property) {
    return { ok: false, error: "Propiedad no encontrada en la empresa." };
  }

  const contract = await prisma.contract.create({
    data: {
      organizationId: session.organizationId,
      code,
      propertyId: d.propertyId,
      status: "ACTIVE",
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      initialRent: d.initialRent,
      currency: d.currency,
      depositAmount: d.depositAmount,
      agencyCommissionPct:
        d.commissionMode === "PERCENT_RENT" ? d.commissionValue : 0,
      commissionMode: d.commissionMode,
      commissionValue: d.commissionValue,
      commissionTenantPct: d.commissionTenantPct,
      commissionOwnerPct: d.commissionOwnerPct,
      lateFeeDailyRatePct: d.lateFeeDailyRatePct,
      includesOrdinaryExp: d.includesOrdinaryExp ?? true,
      includesExtraordExp: d.includesExtraordExp ?? false,
      notes: d.notes || null,
      parties: {
        create: [
          { userId: d.ownerId, role: "OWNER", sharePct: 100 },
          { userId: d.tenantId, role: "TENANT", sharePct: 100 },
          ...(d.guarantorId
            ? [{ userId: d.guarantorId, role: "GUARANTOR" as const }]
            : []),
        ],
      },
      adjustments: {
        create: [
          {
            indexType: d.indexType,
            periodMonths: d.periodMonths,
            effectiveFrom: new Date(d.startDate),
            notes: `Ajuste cada ${d.periodMonths} meses`,
          },
        ],
      },
    },
  });

  await ensureOwnerOwnership(d.propertyId, d.ownerId);

  await prisma.property.update({
    where: { id: d.propertyId },
    data: { status: "RENTED" },
  });

  revalidatePath("/contratos");
  revalidatePath(`/contratos/${contract.id}`);
  revalidatePath("/gestion/propiedades");
  revalidatePath("/rendiciones");
  return { ok: true };
}

export async function updateContractAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = contractUpdateSchema.safeParse({
    ...formDataToObject(formData),
    includesOrdinaryExp:
      formData.get("includesOrdinaryExp") === "on" ||
      formData.get("includesOrdinaryExp") === "true",
    includesExtraordExp:
      formData.get("includesExtraordExp") === "on" ||
      formData.get("includesExtraordExp") === "true",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const d = parsed.data;
  const existing = await prisma.contract.findFirst({
    where: { id: d.id, organizationId: session.organizationId },
    select: { id: true, propertyId: true, status: true },
  });
  if (!existing) {
    return { ok: false, error: "Contrato no encontrado." };
  }

  await prisma.contract.update({
    where: { id: d.id },
    data: {
      status: d.status,
      endDate: new Date(d.endDate),
      agencyCommissionPct:
        d.commissionMode === "PERCENT_RENT" ? d.commissionValue : 0,
      commissionMode: d.commissionMode,
      commissionValue: d.commissionValue,
      commissionTenantPct: d.commissionTenantPct,
      commissionOwnerPct: d.commissionOwnerPct,
      lateFeeDailyRatePct: d.lateFeeDailyRatePct,
      includesOrdinaryExp: d.includesOrdinaryExp ?? true,
      includesExtraordExp: d.includesExtraordExp ?? false,
      notes: d.notes || null,
    },
  });

  await syncPropertyStatusForContract(existing.propertyId, d.status, d.id);

  revalidatePath("/contratos");
  revalidatePath(`/contratos/${d.id}`);
  revalidatePath("/gestion/propiedades");
  return { ok: true };
}

export async function updateDepositAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const contractId = String(formData.get("contractId") ?? "");
  const depositAmount = Number(formData.get("depositAmount"));
  const depositHeld = formData.get("depositHeld") === "true";
  const note = String(formData.get("note") ?? "").trim();

  if (!contractId || !(depositAmount >= 0) || Number.isNaN(depositAmount)) {
    return { ok: false, error: "Contrato y monto de depósito inválidos." };
  }

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId: session.organizationId },
  });
  if (!contract) return { ok: false, error: "Contrato no encontrado." };

  const notesExtra = note
    ? `${contract.notes ? `${contract.notes}\n` : ""}[Depósito] ${note}`
    : contract.notes;

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      depositAmount,
      depositHeld,
      notes: notesExtra,
    },
  });

  revalidatePath(`/contratos/${contractId}`);
  revalidatePath("/contratos");
  return { ok: true, message: depositHeld ? "Depósito en custodia." : "Depósito marcado como devuelto." };
}

export async function applyDepositToBalanceAction(
  contractId: string,
): Promise<ActionResult> {
  const session = await requireStaff();
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId: session.organizationId },
  });
  if (!contract) return { ok: false, error: "Contrato no encontrado." };
  if (!contract.depositHeld || Number(contract.depositAmount) <= 0) {
    return { ok: false, error: "No hay depósito en custodia para aplicar." };
  }

  const bill = await prisma.tenantBill.findFirst({
    where: {
      contractId,
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
  });
  if (!bill) {
    return { ok: false, error: "No hay cuotas abiertas para aplicar el depósito." };
  }

  const balance = Number(bill.totalAmount) - Number(bill.paidAmount);
  if (balance <= 0) {
    return { ok: false, error: "La cuota abierta no tiene saldo." };
  }

  const applyAmount = Math.min(Number(contract.depositAmount), balance);
  await recordPayment({
    tenantBillId: bill.id,
    amount: applyAmount,
    method: "OTHER",
    reference: `Depósito contrato ${contract.code}`,
    notes: "Aplicación de garantía/depósito",
    recordedById: session.user.id,
  });

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      depositHeld: false,
      notes: `${contract.notes ? `${contract.notes}\n` : ""}[Depósito] Aplicado $${applyAmount} a cuota ${bill.periodMonth}/${bill.periodYear}`,
    },
  });

  revalidatePath(`/contratos/${contractId}`);
  revalidatePath(`/cobros/${bill.id}`);
  revalidatePath("/cobros");
  return {
    ok: true,
    message: `Se aplicaron $${applyAmount} a la cuota ${bill.periodMonth}/${bill.periodYear}.`,
  };
}

export async function applyContractAdjustmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const contractId = String(formData.get("contractId") ?? "");
  const percent = Number(formData.get("percent"));
  const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!contractId || !(percent > 0) || !effectiveFromRaw) {
    return { ok: false, error: "Completá contrato, porcentaje y fecha." };
  }

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId: session.organizationId },
    select: { id: true, currency: true },
  });
  if (!contract) {
    return { ok: false, error: "Contrato no encontrado." };
  }

  try {
    const adj = await applyContractAdjustment({
      contractId,
      percent,
      effectiveFrom: new Date(effectiveFromRaw),
      notes: notes || undefined,
    });
    revalidatePath("/contratos");
    revalidatePath(`/contratos/${contractId}`);
    revalidatePath("/cobros");
    return {
      ok: true,
      message: `Nuevo alquiler: ${Number(adj.appliedRent).toLocaleString("es-AR")} (${percent}%)`,
    } as ActionResult;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo aplicar el ajuste",
    };
  }
}
