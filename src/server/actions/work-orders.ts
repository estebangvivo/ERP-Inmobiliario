"use server";

import { CostBearer, WorkOrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { issuePaymentOrderForSupplierInvoice } from "@/features/treasury/lib/issue-docs-from-billing";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import type { DocActionResult } from "@/server/actions/billing";
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

  if (assigneeId) {
    const supplier = await prisma.organizationMember.findFirst({
      where: {
        organizationId: session.organizationId,
        userId: assigneeId,
        role: "SUPPLIER",
        user: {
          isActive: true,
          ...excludePlatformSuperadminFromUser(),
        },
      },
    });
    if (!supplier) {
      return { ok: false, error: "Proveedor no válido." };
    }
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
  revalidatePath("/tesoreria/cuentas");
  return { ok: true };
}

export async function paySupplierInvoiceAction(
  _prev: DocActionResult | null,
  formData: FormData,
): Promise<DocActionResult> {
  const session = await requireStaff();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const method = String(formData.get("method") ?? "BANK_TRANSFER");
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();

  if (!invoiceId) return { ok: false, error: "Factura requerida." };
  if (method === "BANK_TRANSFER" && !bankAccountId) {
    return { ok: false, error: "Elegí la cuenta bancaria para la transferencia." };
  }

  const invoice = await prisma.supplierInvoice.findFirst({
    where: {
      id: invoiceId,
      paidAt: null,
      workOrder: { organizationId: session.organizationId },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      workOrder: {
        select: {
          id: true,
          code: true,
          contractId: true,
          propertyId: true,
        },
      },
    },
  });
  if (!invoice) return { ok: false, error: "Factura no encontrada o ya pagada." };

  let contractId = invoice.workOrder.contractId;
  if (!contractId) {
    const contract = await prisma.contract.findFirst({
      where: {
        organizationId: session.organizationId,
        propertyId: invoice.workOrder.propertyId,
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
        "La OT no tiene contrato vinculado. Asocialo o creá la OP desde Tesorería.",
    };
  }

  const amount = Math.round(Number(invoice.amount) * 100) / 100;
  const result = await issuePaymentOrderForSupplierInvoice({
    invoiceId: invoice.id,
    supplierId: invoice.supplierId,
    supplierName: invoice.supplier.name,
    contractId,
    amount,
    currency: invoice.currency,
    method,
    bankAccountId: bankAccountId || undefined,
    reference: reference || undefined,
    description: `Factura ${invoice.invoiceNumber ?? invoice.id.slice(-6)} · OT ${invoice.workOrder.code}`,
  });

  if (!result.ok) return { ok: false, error: result.error };

  if (result.postError) {
    return {
      ok: false,
      error: `${result.postError} La OP ${result.number} quedó en borrador en Tesorería.`,
      printUrl: `/tesoreria/ordenes-pago/${result.id}/print`,
    };
  }

  revalidatePath("/mantenimiento");
  revalidatePath(`/mantenimiento/${invoice.workOrder.id}`);
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/ordenes-pago");
  revalidatePath(`/tesoreria/ordenes-pago/${result.id}`);
  revalidatePath("/tesoreria/caja");
  revalidatePath("/tesoreria/bancos");
  revalidatePath("/tesoreria/cuentas");
  revalidatePath(`/tesoreria/cuentas/proveedores/${invoice.supplierId}`);

  const printUrl = `/tesoreria/ordenes-pago/${result.id}/print?autoPrint=1`;
  return {
    ok: true,
    message: `Orden de pago ${result.number} generada.`,
    printUrl,
    documentNumber: result.number,
  };
}
