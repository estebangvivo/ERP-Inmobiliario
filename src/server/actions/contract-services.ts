"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { contractScopeWhere } from "@/lib/tenant-scope";
import type { ActionResult } from "@/server/actions/users";
import {
  addContractServiceSchema,
  contractServicesJsonSchema,
  removeContractServiceSchema,
  updateContractServiceSchema,
} from "@/server/validators/contract-services";
import {
  computeBillTotalAmount,
  computeContractServicesAmountForBill,
  syncAllOpenBillContractServiceLines,
  syncOpenBillsContractServicesFrom,
  upsertContractServiceBillOverride,
} from "@/server/services/contract-services-billing";
import { computeBillStatus } from "@/server/services/bill-utils";
import type { ContractServiceInput } from "@/features/contracts/lib/contract-services";

export async function createContractServices(
  contractId: string,
  items: ContractServiceInput[],
) {
  if (items.length === 0) return;

  await prisma.contractService.createMany({
    data: items.map((item, index) => ({
      contractId,
      category: item.category,
      concept: item.concept.trim(),
      amount: item.amount,
      paidBy: item.paidBy,
      active: item.active ?? item.amount > 0,
      sortOrder: index,
    })),
  });
}

export async function parseContractServicesFromForm(
  formData: FormData,
): Promise<ContractServiceInput[]> {
  const raw = formData.get("contractServicesJson");
  if (!raw || typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = contractServicesJsonSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.filter((s) => s.active && s.amount > 0);
  } catch {
    return [];
  }
}

async function assertContractAccess(contractId: string, organizationId: string) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, startDate: true },
  });
  if (!contract) throw new Error("Contrato no encontrado.");
  return contract;
}

async function resyncBillTotal(billId: string) {
  const bill = await prisma.tenantBill.findUniqueOrThrow({
    where: { id: billId },
  });
  if (bill.status === "PAID" || bill.status === "CANCELLED") return;

  const contractServicesAmount = await computeContractServicesAmountForBill(
    bill.contractId,
    bill.id,
  );
  const totalAmount = computeBillTotalAmount({
    rentAmount: Number(bill.rentAmount),
    expensesAmount: Number(bill.expensesAmount),
    contractServicesAmount,
    commissionAmount: Number(bill.commissionAmount),
    lateFeeAmount: Number(bill.lateFeeAmount),
    otherAmount: Number(bill.otherAmount),
  });
  const status = computeBillStatus(
    totalAmount,
    Number(bill.paidAmount),
    bill.dueDate,
  );
  await prisma.tenantBill.update({
    where: { id: billId },
    data: { contractServicesAmount, totalAmount, status },
  });
}

export async function addContractServiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = addContractServiceSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const d = parsed.data;
  await assertContractAccess(d.contractId, session.organizationId);

  const maxSort = await prisma.contractService.aggregate({
    where: { contractId: d.contractId },
    _max: { sortOrder: true },
  });

  const service = await prisma.contractService.create({
    data: {
      contractId: d.contractId,
      category: d.category,
      concept: d.concept.trim(),
      amount: d.amount,
      paidBy: d.paidBy,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await syncAllOpenBillContractServiceLines(d.contractId);

  revalidatePath(`/contratos/${d.contractId}`);
  revalidatePath("/cobros");
  revalidatePath("/cobros/cuenta-corriente");

  return {
    ok: true,
    message: `Servicio "${service.concept}" agregado al contrato.`,
  };
}

export async function updateContractServiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = updateContractServiceSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const d = parsed.data;
  const service = await prisma.contractService.findFirst({
    where: {
      id: d.id,
      contract: { organizationId: session.organizationId },
    },
    include: { contract: { select: { id: true, startDate: true } } },
  });
  if (!service) {
    return { ok: false, error: "Servicio no encontrado." };
  }

  if (d.scope === "SINGLE_BILL") {
    if (!d.tenantBillId) {
      return { ok: false, error: "Seleccioná la cuota a modificar." };
    }
    const bill = await prisma.tenantBill.findFirst({
      where: {
        id: d.tenantBillId,
        contractId: service.contractId,
        kind: "SERVICES",
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      },
    });
    if (!bill) {
      return { ok: false, error: "Cuota de servicios no encontrada o ya cerrada." };
    }

    await upsertContractServiceBillOverride({
      tenantBillId: bill.id,
      contractServiceId: service.id,
      concept: service.concept,
      amount: d.amount,
      paidBy: d.paidBy,
    });
    await resyncBillTotal(bill.id);
  } else {
    const fromYear =
      d.fromYear ?? service.contract.startDate.getUTCFullYear();
    const fromMonth =
      d.fromMonth ?? service.contract.startDate.getUTCMonth() + 1;

    await prisma.contractService.update({
      where: { id: service.id },
      data: { amount: d.amount, paidBy: d.paidBy },
    });
    await syncOpenBillsContractServicesFrom(
      service.contractId,
      fromYear,
      fromMonth,
    );
  }

  revalidatePath(`/contratos/${service.contractId}`);
  revalidatePath("/cobros");
  revalidatePath("/cobros/cuenta-corriente");

  return { ok: true, message: "Servicio actualizado." };
}

export async function removeContractServiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = removeContractServiceSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const service = await prisma.contractService.findFirst({
    where: {
      id: parsed.data.id,
      contract: { organizationId: session.organizationId },
    },
    include: { contract: { select: { id: true, startDate: true } } },
  });
  if (!service) {
    return { ok: false, error: "Servicio no encontrado." };
  }

  await prisma.contractService.update({
    where: { id: service.id },
    data: { active: false },
  });

  await syncAllOpenBillContractServiceLines(service.contractId);

  revalidatePath(`/contratos/${service.contractId}`);
  revalidatePath("/cobros");
  revalidatePath("/cobros/cuenta-corriente");

  return { ok: true, message: `"${service.concept}" quitado del contrato.` };
}

export async function listContractOpenBillsForServiceEdit(
  contractId: string,
) {
  const session = await requireStaff();
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, AND: [contractScopeWhere(session)] },
    select: { id: true },
  });
  if (!contract) return [];

  return prisma.tenantBill.findMany({
    where: {
      contractId,
      kind: "SERVICES",
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      dueDate: true,
      status: true,
    },
  });
}
