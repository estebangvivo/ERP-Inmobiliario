"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import {
  applyLateFee,
  generateBillsForPeriod,
  recordPayment,
} from "@/server/services/billing";
import type { ActionResult } from "@/server/actions/users";

export async function generatePeriodBillsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const year = Number(formData.get("periodYear"));
  const month = Number(formData.get("periodMonth"));
  if (!year || !month || month < 1 || month > 12) {
    return { ok: false, error: "Período inválido" };
  }

  try {
    const bills = await generateBillsForPeriod(
      session.organizationId,
      year,
      month,
    );
    revalidatePath("/cobros");
    return { ok: true, message: `Se generaron/actualizaron ${bills.length} cuotas` } as ActionResult;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al generar" };
  }
}

export async function recordPaymentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const tenantBillId = String(formData.get("tenantBillId") ?? "");
  const amount = Number(formData.get("amount"));
  const method = String(formData.get("method") ?? "BANK_TRANSFER") as
    | "CASH"
    | "BANK_TRANSFER"
    | "CHECK"
    | "CARD"
    | "GATEWAY"
    | "OTHER";
  const reference = String(formData.get("reference") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!tenantBillId || !(amount > 0)) {
    return { ok: false, error: "Cuota y monto son obligatorios" };
  }

  try {
    await recordPayment({
      tenantBillId,
      amount,
      method,
      reference: reference || undefined,
      notes: notes || undefined,
      recordedById: session.user.id,
    });
    revalidatePath("/cobros");
    revalidatePath(`/cobros/${tenantBillId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al registrar pago" };
  }
}

export async function applyLateFeeAction(billId: string): Promise<ActionResult> {
  await requireStaff();
  try {
    await applyLateFee(billId);
    revalidatePath("/cobros");
    revalidatePath(`/cobros/${billId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al calcular mora" };
  }
}
