"use server";

import { ExpenseType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { createExpenseWithAllocations } from "@/server/services/expenses";
import type { ActionResult } from "@/server/actions/users";

export async function createExpenseAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();

  const complexId = String(formData.get("complexId") ?? "");
  const type = String(formData.get("type") ?? "ORDINARY") as ExpenseType;
  const concept = String(formData.get("concept") ?? "").trim();
  const periodYear = Number(formData.get("periodYear"));
  const periodMonth = Number(formData.get("periodMonth"));
  const totalAmount = Number(formData.get("totalAmount"));
  const billToTenant =
    formData.get("billToTenant") === "on" ||
    formData.get("billToTenant") === "true";

  if (!complexId || !concept || !periodYear || !periodMonth || !(totalAmount > 0)) {
    return { ok: false, error: "Completá complejo, concepto, período y monto" };
  }

  try {
    await createExpenseWithAllocations({
      complexId,
      type,
      concept,
      periodYear,
      periodMonth,
      totalAmount,
      billToTenant,
      allocationMethod: "OWNERSHIP_COEFFICIENT",
    });
    revalidatePath("/expensas");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo crear la expensa",
    };
  }
}
