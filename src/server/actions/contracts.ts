"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import {
  contractCreateSchema,
  contractUpdateSchema,
} from "@/server/validators/contract";
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

  await prisma.contract.create({
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

  await prisma.property.update({
    where: { id: d.propertyId },
    data: { status: "RENTED" },
  });

  revalidatePath("/contratos");
  revalidatePath("/propiedades");
  return { ok: true };
}

export async function updateContractAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
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

  revalidatePath("/contratos");
  revalidatePath(`/contratos/${d.id}`);
  return { ok: true };
}
