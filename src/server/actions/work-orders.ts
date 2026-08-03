"use server";

import { CostBearer, WorkOrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import type { ActionResult } from "@/server/actions/users";

async function nextWorkOrderCode(organizationId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.workOrder.count({
    where: {
      organizationId,
      code: { startsWith: `OT-${year}-` },
    },
  });
  return `OT-${year}-${String(count + 1).padStart(3, "0")}`;
}

export async function createWorkOrderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const propertyId = String(formData.get("propertyId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const costBearer = String(formData.get("costBearer") ?? "OWNER_DEDUCTIBLE") as CostBearer;
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");

  if (!propertyId || !title) {
    return { ok: false, error: "Propiedad y título son obligatorios" };
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: session.organizationId },
  });
  if (!property) {
    return { ok: false, error: "Propiedad no encontrada." };
  }

  await prisma.workOrder.create({
    data: {
      organizationId: session.organizationId,
      code: await nextWorkOrderCode(session.organizationId),
      propertyId,
      title,
      description: description || null,
      costBearer,
      status: assigneeId ? "ASSIGNED" : "OPEN",
      assigneeId: assigneeId || null,
      contractId: contractId || null,
    },
  });

  revalidatePath("/mantenimiento");
  return { ok: true };
}

export async function updateWorkOrderStatusAction(
  id: string,
  status: WorkOrderStatus,
): Promise<ActionResult> {
  await requireStaff();
  await prisma.workOrder.update({
    where: { id },
    data: {
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });
  revalidatePath("/mantenimiento");
  revalidatePath(`/mantenimiento/${id}`);
  return { ok: true };
}

export async function createSupplierInvoiceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  const workOrderId = String(formData.get("workOrderId") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  const amount = Number(formData.get("amount"));
  const invoiceDate = String(formData.get("invoiceDate") ?? "");
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "");
  const costBearer = String(formData.get("costBearer") ?? "OWNER_DEDUCTIBLE") as CostBearer;
  const notes = String(formData.get("notes") ?? "");

  if (!workOrderId || !supplierId || !(amount > 0) || !invoiceDate) {
    return { ok: false, error: "Completá OT, proveedor, monto y fecha" };
  }

  await prisma.supplierInvoice.create({
    data: {
      workOrderId,
      supplierId,
      amount,
      invoiceDate: new Date(invoiceDate),
      invoiceNumber: invoiceNumber || null,
      costBearer,
      notes: notes || null,
    },
  });

  revalidatePath("/mantenimiento");
  revalidatePath(`/mantenimiento/${workOrderId}`);
  return { ok: true };
}
