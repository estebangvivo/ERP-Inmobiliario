"use server";

import { revalidatePath } from "next/cache";
import { parseDateInput } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import {
  contractCreateSchema,
  contractGuarantorsSchema,
  contractUpdateSchema,
} from "@/server/validators/contract";
import {
  applyContractAdjustment,
  generateContractTotalCommissionInstallments,
  generateTenantBillsForContract,
  recordPayment,
} from "@/server/services/billing";
import type { ActionResult } from "@/server/actions/users";
import { saveContractAttachments } from "@/server/actions/contract-attachments";
import {
  createContractServices,
  parseContractServicesFromForm,
} from "@/server/actions/contract-services";

function formDataToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function parseGuarantorIds(formData: FormData): string[] {
  const ids = formData
    .getAll("guarantorId")
    .map((v) => String(v).trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

function parseGuarantorDuplicateAcks(formData: FormData): Set<string> {
  return new Set(
    formData
      .getAll("guarantorDuplicateAck")
      .map((v) => String(v).trim())
      .filter(Boolean),
  );
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
  const guarantorIds = parseGuarantorIds(formData);
  const guarantorAcks = parseGuarantorDuplicateAcks(formData);
  const parsed = contractCreateSchema.safeParse({
    ...raw,
    guarantorIds,
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
  const startDate = parseDateInput(d.startDate);
  const endDate = parseDateInput(d.endDate);
  if (!startDate || !endDate) {
    return { ok: false, error: "Las fechas de inicio y fin son inválidas." };
  }
  if (endDate <= startDate) {
    return { ok: false, error: "La fecha de fin debe ser posterior al inicio" };
  }
  if (d.guarantorIds.includes(d.tenantId)) {
    return {
      ok: false,
      error: "El inquilino no puede figurar también como garante.",
    };
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
      startDate,
      endDate,
      initialRent: d.initialRent,
      currency: d.currency,
      depositAmount: d.depositAmount,
      depositHeld: d.depositAmount > 0,
      agencyCommissionPct:
        d.commissionMode === "PERCENT_RENT" ? d.commissionValue : 0,
      commissionMode: d.commissionMode,
      commissionValue: d.commissionValue,
      commissionTenantPct: d.commissionTenantPct,
      commissionOwnerPct: d.commissionOwnerPct,
      commissionInstallments:
        d.commissionMode === "CONTRACT_TOTAL"
          ? (d.commissionInstallments ?? null)
          : null,
      lateFeeDailyRatePct: d.lateFeeDailyRatePct,
      includesOrdinaryExp: d.includesOrdinaryExp ?? true,
      includesExtraordExp: d.includesExtraordExp ?? false,
      notes: d.notes || null,
      parties: {
        create: [
          { userId: d.ownerId, role: "OWNER", sharePct: 100 },
          { userId: d.tenantId, role: "TENANT", sharePct: 100 },
          ...d.guarantorIds.map((userId) => ({
            userId,
            role: "GUARANTOR" as const,
            duplicateGuarantorAck: guarantorAcks.has(userId),
          })),
        ],
      },
      adjustments: {
        create: [
          {
            indexType: d.indexType,
            periodMonths: d.periodMonths,
            effectiveFrom: startDate,
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

  const attachmentFiles = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const attachmentKinds = formData.getAll("attachmentKinds").map(String);
  const attachmentsResult = await saveContractAttachments(
    contract.id,
    attachmentFiles,
    attachmentKinds,
  );

  const contractServices = await parseContractServicesFromForm(formData);
  await createContractServices(contract.id, contractServices);

  const bills = await generateTenantBillsForContract(contract.id, {
    dueDay: 10,
  });
  const commissionBills =
    await generateContractTotalCommissionInstallments(contract.id, {
      dueDay: 10,
    });

  revalidatePath("/contratos");
  revalidatePath(`/contratos/${contract.id}`);
  revalidatePath("/gestion/propiedades");
  revalidatePath("/rendiciones");
  revalidatePath("/cobros");
  revalidatePath("/cobros/cuenta-corriente");
  const commissionNote =
    commissionBills.length > 0
      ? ` Honorarios en ${commissionBills.length} cuota${commissionBills.length === 1 ? "" : "s"}.`
      : "";
  const attachmentsNote =
    attachmentsResult.saved > 0
      ? ` ${attachmentsResult.saved} archivo(s) adjunto(s).`
      : "";
  const attachmentsWarn = attachmentsResult.error
    ? ` ${attachmentsResult.error}`
    : "";
  return {
    ok: true,
    message: `Contrato creado con ${bills.length} cuota${bills.length === 1 ? "" : "s"} de alquiler (vencimiento día 10).${commissionNote}${attachmentsNote}${attachmentsWarn}`,
  };
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
  const endDate = parseDateInput(d.endDate);
  if (!endDate) {
    return { ok: false, error: "La fecha de fin es inválida." };
  }
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
      endDate,
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

export async function updateContractGuarantorsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const guarantorAcks = parseGuarantorDuplicateAcks(formData);
  const parsed = contractGuarantorsSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    guarantorIds: parseGuarantorIds(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { id, guarantorIds } = parsed.data;
  const contract = await prisma.contract.findFirst({
    where: { id, organizationId: session.organizationId },
    select: {
      id: true,
      parties: {
        select: {
          id: true,
          userId: true,
          role: true,
          duplicateGuarantorAck: true,
        },
      },
    },
  });
  if (!contract) {
    return { ok: false, error: "Contrato no encontrado." };
  }

  const tenantId = contract.parties.find((p) => p.role === "TENANT")?.userId;
  if (tenantId && guarantorIds.includes(tenantId)) {
    return {
      ok: false,
      error: "El inquilino no puede figurar también como garante.",
    };
  }
  const ownerId = contract.parties.find((p) => p.role === "OWNER")?.userId;
  if (ownerId && guarantorIds.includes(ownerId)) {
    return {
      ok: false,
      error: "El propietario no puede figurar también como garante.",
    };
  }

  const current = contract.parties.filter((p) => p.role === "GUARANTOR");
  const currentIds = new Set(current.map((p) => p.userId));
  const nextIds = new Set(guarantorIds);
  const toRemove = current.filter((p) => !nextIds.has(p.userId));
  const toAdd = guarantorIds.filter((userId) => !currentIds.has(userId));
  const toKeep = current.filter((p) => nextIds.has(p.userId));

  await prisma.$transaction([
    ...toRemove.map((p) =>
      prisma.contractParty.delete({ where: { id: p.id } }),
    ),
    ...toAdd.map((userId) =>
      prisma.contractParty.create({
        data: {
          contractId: contract.id,
          userId,
          role: "GUARANTOR",
          duplicateGuarantorAck: guarantorAcks.has(userId),
        },
      }),
    ),
    ...toKeep.map((p) =>
      prisma.contractParty.update({
        where: { id: p.id },
        data: {
          duplicateGuarantorAck:
            guarantorAcks.has(p.userId) || p.duplicateGuarantorAck,
        },
      }),
    ),
  ]);

  revalidatePath("/contratos");
  revalidatePath(`/contratos/${contract.id}`);
  const count = guarantorIds.length;
  return {
    ok: true,
    message:
      count === 0
        ? "Contrato sin garantes."
        : `Se guardaron ${count} garante${count === 1 ? "" : "s"}.`,
  };
}

export async function updateDepositAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const contractId = String(formData.get("contractId") ?? "");
  const rawDeposit = formData.get("depositAmount");
  const depositAmount =
    rawDeposit === "" || rawDeposit == null ? 0 : Number(rawDeposit);
  const depositHeld =
    depositAmount > 0 && formData.get("depositHeld") === "true";
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
  return { ok: true, message: depositAmount > 0 && depositHeld ? "Depósito en custodia." : "Depósito actualizado." };
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
  let percent = Number(formData.get("percent"));
  const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!contractId || !effectiveFromRaw) {
    return { ok: false, error: "Completá contrato y fecha de vigencia." };
  }

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId: session.organizationId },
    include: {
      adjustments: { orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  if (!contract) {
    return { ok: false, error: "Contrato no encontrado." };
  }

  const policy = contract.adjustments[0];
  const effectiveFrom = parseDateInput(effectiveFromRaw);
  if (!effectiveFrom) {
    return { ok: false, error: "Fecha de vigencia inválida." };
  }
  const periodYear = effectiveFrom.getUTCFullYear();
  const periodMonth = effectiveFrom.getUTCMonth() + 1;
  // Las tasas se cargan el mes anterior a la vigencia (ej. junio → julio).
  const loadIdx = periodYear * 12 + (periodMonth - 1) - 1;
  const loadYear = Math.floor(loadIdx / 12);
  const loadMonth = (loadIdx % 12) + 1;

  if (!(percent > 0) && policy) {
    const { getMaxIndexPercent, getIndexPercent } = await import(
      "@/server/actions/index-rates"
    );
    const periodMonths = policy.periodMonths;

    async function resolveFromRates(
      year: number,
      month: number,
    ): Promise<number | null> {
      if (policy!.indexType === "MAX_ICL_IPC_CP") {
        const rates = await getMaxIndexPercent(
          session.organizationId,
          year,
          month,
          periodMonths,
        );
        return rates.max;
      }
      if (
        policy!.indexType === "IPC" ||
        policy!.indexType === "ICL" ||
        policy!.indexType === "CP"
      ) {
        return getIndexPercent(
          session.organizationId,
          policy!.indexType,
          year,
          month,
          periodMonths,
        );
      }
      return null;
    }

    percent =
      (await resolveFromRates(loadYear, loadMonth)) ??
      (await resolveFromRates(periodYear, periodMonth)) ??
      0;

    if (!(percent > 0) &&
      (policy.indexType === "MAX_ICL_IPC_CP" ||
        policy.indexType === "IPC" ||
        policy.indexType === "ICL" ||
        policy.indexType === "CP")
    ) {
      return {
        ok: false,
        error: `No hay índices para ${loadMonth}/${loadYear} (ni ${periodMonth}/${periodYear}) · ${periodMonths} meses. Cargalos en Contratos.`,
      };
    }
  }

  if (!(percent > 0)) {
    return {
      ok: false,
      error: "Indicá el porcentaje o cargá los índices del período.",
    };
  }

  try {
    const adj = await applyContractAdjustment({
      contractId,
      percent,
      effectiveFrom,
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
