"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff, isStaffRole } from "@/lib/session";
import {
  applyRecoverableRecovery,
  getOpenRecoverableBalanceForOwner,
} from "@/server/services/recoverable-charges";
import type { ActionResult } from "@/server/actions/users";

function parseDateInput(value: string): Date | null {
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function revalidateRecoverable(ownerId: string, settlementId?: string) {
  revalidatePath("/tesoreria/cuentas");
  revalidatePath(`/tesoreria/cuentas/recuperables/${ownerId}`);
  revalidatePath("/reportes/gastos-recuperables");
  revalidatePath("/rendiciones");
  if (settlementId) revalidatePath(`/rendiciones/${settlementId}`);
}

export async function registerRecoverableRecoveryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  if (!isStaffRole(session.organizationRole)) {
    return { ok: false, error: "Sin permiso." };
  }

  const chargeId = String(formData.get("chargeId") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const recoveredAtRaw = String(formData.get("recoveredAt") ?? "").trim();
  const methodRaw = String(formData.get("method") ?? "MANUAL").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const receiptId = String(formData.get("receiptId") ?? "").trim();
  const referenceWorkOrderId = String(
    formData.get("referenceWorkOrderId") ?? "",
  ).trim();

  if (!chargeId) return { ok: false, error: "Cargo requerido." };
  if (!(amount > 0)) return { ok: false, error: "Monto inválido." };

  const recoveredAt = parseDateInput(recoveredAtRaw) ?? new Date();
  const method =
    methodRaw === "RECEIPT"
      ? "RECEIPT"
      : methodRaw === "SETTLEMENT"
        ? "SETTLEMENT"
        : "MANUAL";

  try {
    if (receiptId) {
      const receipt = await prisma.receipt.findFirst({
        where: {
          id: receiptId,
          organizationId: session.organizationId,
          status: { in: ["POSTED", "ISSUED"] },
        },
        select: { id: true },
      });
      if (!receipt) {
        return { ok: false, error: "Recibo no encontrado o no imputado." };
      }
    }

    if (referenceWorkOrderId) {
      const wo = await prisma.workOrder.findFirst({
        where: {
          id: referenceWorkOrderId,
          organizationId: session.organizationId,
        },
        select: { id: true },
      });
      if (!wo) {
        return { ok: false, error: "OT de referencia no encontrada." };
      }
    }

    const charge = await prisma.recoverableCharge.findFirst({
      where: { id: chargeId, organizationId: session.organizationId },
      select: { ownerId: true },
    });
    if (!charge) return { ok: false, error: "Cargo no encontrado." };

    await prisma.$transaction(async (tx) => {
      await applyRecoverableRecovery(tx, {
        organizationId: session.organizationId,
        chargeId,
        amount,
        recoveredAt,
        method: receiptId ? "RECEIPT" : method,
        notes: notes || null,
        receiptId: receiptId || null,
        referenceWorkOrderId: referenceWorkOrderId || null,
      });
    });

    revalidateRecoverable(charge.ownerId);
    return { ok: true, message: "Recupero registrado." };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo registrar el recupero.",
    };
  }
}

export async function applyRecoverableToSettlementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  if (!isStaffRole(session.organizationRole)) {
    return { ok: false, error: "Sin permiso." };
  }

  const settlementId = String(formData.get("settlementId") ?? "").trim();
  if (!settlementId) return { ok: false, error: "Rendición requerida." };

  const apps: { chargeId: string; amount: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("chargeAmount_")) continue;
    const chargeId = key.slice("chargeAmount_".length);
    const amount = Number(value);
    if (chargeId && amount > 0.009) {
      apps.push({ chargeId, amount });
    }
  }

  if (apps.length === 0) {
    return { ok: false, error: "Indicá al menos un monto a deducir." };
  }

  try {
    const settlement = await prisma.ownerSettlement.findFirst({
      where: { id: settlementId, organizationId: session.organizationId },
    });
    if (!settlement) return { ok: false, error: "Rendición no encontrada." };
    if (settlement.status !== "DRAFT") {
      return {
        ok: false,
        error: "Solo se pueden deducir gastos a recuperar en borrador.",
      };
    }

    await prisma.$transaction(async (tx) => {
      let extraDeductions = 0;
      const recoveredAt = new Date();

      for (const app of apps) {
        const charge = await tx.recoverableCharge.findFirst({
          where: {
            id: app.chargeId,
            organizationId: session.organizationId,
            ownerId: settlement.ownerId,
            currency: settlement.currency,
            status: { in: ["OPEN", "PARTIAL"] },
          },
          include: {
            workOrder: { select: { code: true, title: true } },
          },
        });
        if (!charge) {
          throw new Error("Cargo a recuperar inválido para esta rendición.");
        }

        await applyRecoverableRecovery(tx, {
          organizationId: session.organizationId,
          chargeId: charge.id,
          amount: app.amount,
          recoveredAt,
          method: "SETTLEMENT",
          ownerSettlementId: settlement.id,
          notes: `Deducción en ${settlement.code}`,
        });

        await tx.settlementLineItem.create({
          data: {
            settlementId: settlement.id,
            concept: `Recupero gasto · ${charge.workOrder.code} · ${charge.workOrder.title}`,
            amount: -Math.round(app.amount * 100) / 100,
            supplierInvoiceId: charge.supplierInvoiceId,
          },
        });

        extraDeductions += Math.round(app.amount * 100) / 100;
      }

      const deductionsAmount =
        Math.round(
          (Number(settlement.deductionsAmount) + extraDeductions) * 100,
        ) / 100;
      const netPayout =
        Math.round(
          (Number(settlement.grossRent) -
            Number(settlement.commissionAmount) -
            deductionsAmount -
            Number(settlement.extraordinaryAmount)) *
            100,
        ) / 100;

      await tx.ownerSettlement.update({
        where: { id: settlement.id },
        data: { deductionsAmount, netPayout },
      });
    });

    revalidateRecoverable(settlement.ownerId, settlement.id);
    return { ok: true, message: "Gastos a recuperar deducidos de la rendición." };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "No se pudo aplicar el recupero a la rendición.",
    };
  }
}

export async function getOwnerRecoverableWarningAction(ownerId: string) {
  const session = await requireStaff();
  return getOpenRecoverableBalanceForOwner(session.organizationId, ownerId);
}
