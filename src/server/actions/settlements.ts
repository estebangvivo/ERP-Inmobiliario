"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import {
  generateOwnerSettlement,
  issueSettlement,
  markSettlementPaid,
} from "@/server/services/settlements";
import type { ActionResult } from "@/server/actions/users";

export async function generateSettlementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const ownerId = String(formData.get("ownerId") ?? "");
  const periodYear = Number(formData.get("periodYear"));
  const periodMonth = Number(formData.get("periodMonth"));
  const currency = String(formData.get("currency") ?? "ARS") as "ARS" | "USD" | "EUR";

  if (!ownerId || !periodYear || !periodMonth) {
    return { ok: false, error: "Propietario y período son obligatorios" };
  }

  try {
    const settlement = await generateOwnerSettlement({
      organizationId: session.organizationId,
      ownerId,
      periodYear,
      periodMonth,
      currency,
    });
    revalidatePath("/rendiciones");
    revalidatePath(`/rendiciones/${settlement.id}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al generar rendición",
    };
  }
}

export async function issueSettlementAction(id: string): Promise<ActionResult> {
  await requireStaff();
  await issueSettlement(id);
  revalidatePath("/rendiciones");
  revalidatePath(`/rendiciones/${id}`);
  return { ok: true };
}

export async function paySettlementAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const transferRef = String(formData.get("transferRef") ?? "");
  if (!id) return { ok: false, error: "Rendición requerida" };

  await markSettlementPaid(id, transferRef || undefined);
  revalidatePath("/rendiciones");
  revalidatePath(`/rendiciones/${id}`);
  return { ok: true };
}
