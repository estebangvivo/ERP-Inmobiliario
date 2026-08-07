"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import {
  generateOwnerSettlement,
  issueSettlement,
} from "@/server/services/settlements";
import { issuePaymentOrderForSettlement } from "@/features/treasury/lib/issue-docs-from-billing";
import type { ActionResult } from "@/server/actions/users";
import type { DocActionResult } from "@/server/actions/billing";

export async function generateSettlementsForPeriodAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const periodYear = Number(formData.get("periodYear"));
  const periodMonth = Number(formData.get("periodMonth"));
  const currency = String(formData.get("currency") ?? "ARS") as
    | "ARS"
    | "USD"
    | "EUR";

  if (!periodYear || !periodMonth) {
    return { ok: false, error: "Período obligatorio" };
  }

  try {
    const { generateSettlementsForPeriod } = await import(
      "@/server/services/monthly-job"
    );
    const result = await generateSettlementsForPeriod({
      organizationId: session.organizationId,
      periodYear,
      periodMonth,
      currency,
    });
    revalidatePath("/rendiciones");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `Rendiciones: ${result.created} creadas, ${result.skipped} omitidas${
        result.errors.length ? `, ${result.errors.length} errores` : ""
      }.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al generar rendiciones",
    };
  }
}

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
  _prev: DocActionResult | null,
  formData: FormData,
): Promise<DocActionResult> {
  const session = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const transferRef = String(formData.get("transferRef") ?? "").trim();
  const method = String(formData.get("method") ?? "BANK_TRANSFER");
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();

  if (!id) return { ok: false, error: "Rendición requerida" };

  if (method === "BANK_TRANSFER" && !bankAccountId) {
    return { ok: false, error: "Elegí la cuenta bancaria para la transferencia." };
  }

  const settlement = await prisma.ownerSettlement.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      owner: { select: { id: true, name: true } },
      lines: {
        include: {
          tenantBill: { select: { contractId: true } },
        },
      },
    },
  });
  if (!settlement) return { ok: false, error: "Rendición no encontrada." };
  if (settlement.status !== "ISSUED") {
    return { ok: false, error: "Solo se pueden pagar rendiciones emitidas." };
  }

  const amount = Math.round(Number(settlement.netPayout) * 100) / 100;
  if (!(amount > 0)) {
    return { ok: false, error: "La rendición no tiene neto a pagar." };
  }

  let contractId =
    settlement.lines.find((l) => l.tenantBill?.contractId)?.tenantBill
      ?.contractId ?? null;

  if (!contractId) {
    const contract = await prisma.contract.findFirst({
      where: {
        organizationId: session.organizationId,
        parties: { some: { role: "OWNER", userId: settlement.ownerId } },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    contractId = contract?.id ?? null;
  }

  if (!contractId) {
    return {
      ok: false,
      error:
        "No se encontró un contrato asociado para emitir la orden de pago.",
    };
  }

  const result = await issuePaymentOrderForSettlement({
    settlementId: settlement.id,
    ownerId: settlement.ownerId,
    ownerName: settlement.owner.name,
    contractId,
    amount,
    currency: settlement.currency,
    method,
    bankAccountId: bankAccountId || undefined,
    transferRef: transferRef || undefined,
    description: `Rendición ${settlement.code} · ${settlement.periodMonth}/${settlement.periodYear}`,
  });

  if (!result.ok) return { ok: false, error: result.error };

  if (result.postError) {
    return {
      ok: false,
      error: `${result.postError} La OP ${result.number} quedó en borrador en Tesorería.`,
      printUrl: `/tesoreria/ordenes-pago/${result.id}/print`,
    };
  }

  revalidatePath("/rendiciones");
  revalidatePath(`/rendiciones/${id}`);
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/ordenes-pago");
  revalidatePath(`/tesoreria/ordenes-pago/${result.id}`);
  revalidatePath("/tesoreria/caja");
  revalidatePath("/tesoreria/bancos");
  revalidatePath("/tesoreria/cuentas");

  const printUrl = `/tesoreria/ordenes-pago/${result.id}/print?autoPrint=1`;
  return {
    ok: true,
    message: `Orden de pago ${result.number} generada.`,
    printUrl,
    documentNumber: result.number,
  };
}
