"use server";

import { ServiceCostCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import {
  createServiceCost,
  deleteServiceCost,
  generateExpensesFromServiceCosts,
} from "@/server/services/expenses";
import type { ActionResult } from "@/server/actions/users";

export async function createServiceCostAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const scope = String(formData.get("scope") ?? "complex");
  const complexId = String(formData.get("complexId") ?? "").trim();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const category = String(
    formData.get("category") ?? "OTHER",
  ) as ServiceCostCategory;
  const concept = String(formData.get("concept") ?? "").trim();
  const periodYear = Number(formData.get("periodYear"));
  const periodMonth = Number(formData.get("periodMonth"));
  const amount = Number(formData.get("amount"));
  const notes = String(formData.get("notes") ?? "").trim();

  if (!concept || !periodYear || !periodMonth || !(amount > 0)) {
    return { ok: false, error: "Completá concepto, período y monto." };
  }

  try {
    await createServiceCost({
      organizationId: session.organizationId,
      complexId: scope === "complex" ? complexId : null,
      propertyId: scope === "property" ? propertyId : null,
      category,
      concept,
      periodYear,
      periodMonth,
      amount,
      notes: notes || undefined,
    });
    revalidatePath("/expensas");
    return { ok: true, message: "Gasto cargado." };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo cargar el gasto",
    };
  }
}

export async function deleteServiceCostAction(
  serviceCostId: string,
): Promise<ActionResult> {
  const session = await requireStaff();
  try {
    await deleteServiceCost(session.organizationId, serviceCostId);
    revalidatePath("/expensas");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo eliminar",
    };
  }
}

export async function generateFromServiceCostsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const complexId = String(formData.get("complexId") ?? "");
  const periodYear = Number(formData.get("periodYear"));
  const periodMonth = Number(formData.get("periodMonth"));
  const billToTenant =
    formData.get("billToTenant") === "on" ||
    formData.get("billToTenant") === "true";

  if (!complexId || !periodYear || !periodMonth) {
    return { ok: false, error: "Completá edificio y período." };
  }

  try {
    const expenses = await generateExpensesFromServiceCosts({
      organizationId: session.organizationId,
      complexId,
      periodYear,
      periodMonth,
      billToTenant,
    });
    revalidatePath("/expensas");
    revalidatePath("/cobros");
    return {
      ok: true,
      message: `Expensas generadas (${expenses.length}). Prorrateo por m² sobre el total del edificio.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo generar",
    };
  }
}
