"use server";

import { CostLedger, ServiceCostCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import {
  createServiceCost,
  deleteServiceCost,
  generateAllPendingFromServiceCosts,
  generateExpensesForProperty,
  generateExpensesFromServiceCosts,
} from "@/server/services/expenses";
import type { ActionResult } from "@/server/actions/users";

function pathForLedger(ledger: CostLedger) {
  return ledger === "SERVICES" ? "/servicios" : "/expensas";
}

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
  const ledger = (String(formData.get("ledger") ?? "EXPENSES") === "SERVICES"
    ? "SERVICES"
    : "EXPENSES") as CostLedger;

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
      ledger,
    });
    revalidatePath(pathForLedger(ledger));
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
    revalidatePath("/servicios");
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
  const generateScope = String(formData.get("generateScope") ?? "complex") as
    | "complex"
    | "property"
    | "all_pending";
  const complexId = String(formData.get("complexId") ?? "").trim();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const periodYear = Number(formData.get("periodYear"));
  const periodMonth = Number(formData.get("periodMonth"));
  const billToTenant =
    formData.get("billToTenant") === "on" ||
    formData.get("billToTenant") === "true";
  const ledger = (String(formData.get("ledger") ?? "EXPENSES") === "SERVICES"
    ? "SERVICES"
    : "EXPENSES") as CostLedger;
  const force =
    formData.get("force") === "on" || formData.get("force") === "true";

  if (!periodYear || !periodMonth) {
    return { ok: false, error: "Completá el período." };
  }
  if (generateScope === "complex" && !complexId) {
    return { ok: false, error: "Seleccioná un edificio." };
  }
  if (generateScope === "property" && !propertyId) {
    return { ok: false, error: "Seleccioná una propiedad." };
  }

  const noun = ledger === "SERVICES" ? "Servicios" : "Expensas";
  const nounLower = ledger === "SERVICES" ? "servicios" : "expensas";

  try {
    if (generateScope === "all_pending") {
      const { created, errors } = await generateAllPendingFromServiceCosts({
        organizationId: session.organizationId,
        periodYear,
        periodMonth,
        billToTenant,
        ledger,
      });
      revalidatePath(pathForLedger(ledger));
      revalidatePath("/cobros");
      const extra =
        errors.length > 0
          ? ` Avisos: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? "…" : ""}`
          : "";
      return {
        ok: true,
        message: `${noun} pendientes generados (${created.length} documento${created.length === 1 ? "" : "s"}).${extra}`,
      };
    }

    if (generateScope === "property") {
      const expenses = await generateExpensesForProperty({
        organizationId: session.organizationId,
        propertyId,
        periodYear,
        periodMonth,
        billToTenant,
        ledger,
        force,
      });
      revalidatePath(pathForLedger(ledger));
      revalidatePath("/cobros");
      return {
        ok: true,
        message: `${noun} de la propiedad generados (${expenses.length}).`,
      };
    }

    const expenses = await generateExpensesFromServiceCosts({
      organizationId: session.organizationId,
      complexId,
      periodYear,
      periodMonth,
      billToTenant,
      ledger,
      force,
    });
    revalidatePath(pathForLedger(ledger));
    revalidatePath("/cobros");
    return {
      ok: true,
      message: `${noun} del edificio generados (${expenses.length}). Prorrateo por m²; se omiten propiedades ya generadas individualmente.`,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : `No se pudieron generar los ${nounLower}`,
    };
  }
}
