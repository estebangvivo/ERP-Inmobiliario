"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const leadSchema = z.object({
  propertyId: z.string().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(5),
});

export type LeadActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createLeadAction(
  _prev: LeadActionResult | null,
  formData: FormData,
): Promise<LeadActionResult> {
  const parsed = leadSchema.safeParse({
    propertyId: formData.get("propertyId") || undefined,
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  let organizationId: string | null = null;
  const propertyId: string | null = parsed.data.propertyId || null;

  if (propertyId) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { organizationId: true },
    });
    if (!property) {
      return { ok: false, error: "Propiedad no encontrada." };
    }
    organizationId = property.organizationId;
  }

  if (!organizationId) {
    const fallbackOrg = await prisma.organization.findFirst({
      where: { billingStatus: { in: ["ACTIVE", "EXEMPT"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    organizationId = fallbackOrg?.id ?? null;
  }

  if (!organizationId) {
    return { ok: false, error: "No hay inmobiliaria disponible para recibir consultas." };
  }

  const agent = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      role: { in: ["AGENT", "ADMIN"] },
      user: { isActive: true },
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  await prisma.lead.create({
    data: {
      organizationId,
      propertyId,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone || null,
      message: parsed.data.message,
      status: "NEW",
      source: "storefront",
      assigneeId: agent?.userId ?? null,
    },
  });

  revalidatePath("/leads");
  return { ok: true };
}

export async function updateLeadStatusAction(
  id: string,
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "CLOSED",
) {
  await prisma.lead.update({ where: { id }, data: { status } });
  revalidatePath("/leads");
}
