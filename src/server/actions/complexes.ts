"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff, slugify } from "@/lib/session";
import {
  complexCreateSchema,
  complexUpdateSchema,
  unitCreateSchema,
} from "@/server/validators/complex";
import type { ActionResult } from "@/server/actions/users";

function formDataToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function uniqueComplexSlug(
  base: string,
  organizationId: string,
  excludeId?: string,
) {
  const slug = slugify(base) || `complejo-${Date.now()}`;
  let i = 0;
  while (true) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const found = await prisma.complex.findUnique({
      where: { organizationId_slug: { organizationId, slug: candidate } },
    });
    if (!found || found.id === excludeId) return candidate;
    i += 1;
  }
}

export async function createComplexAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = complexCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await prisma.complex.create({
    data: {
      organizationId: session.organizationId,
      name: parsed.data.name,
      slug: await uniqueComplexSlug(parsed.data.name, session.organizationId),
      address: parsed.data.address,
      city: parsed.data.city,
      province: parsed.data.province || null,
      description: parsed.data.description || null,
    },
  });

  revalidatePath("/complejos");
  return { ok: true };
}

export async function updateComplexAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = complexUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const existing = await prisma.complex.findFirst({
    where: { id: parsed.data.id, organizationId: session.organizationId },
  });
  if (!existing) return { ok: false, error: "Edificio no encontrado." };

  await prisma.complex.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      address: parsed.data.address,
      city: parsed.data.city,
      province: parsed.data.province || null,
      description: parsed.data.description || null,
    },
  });

  revalidatePath("/complejos");
  revalidatePath(`/complejos/${parsed.data.id}`);
  return { ok: true };
}

export async function createUnitAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  const parsed = unitCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const d = parsed.data;
  try {
    await prisma.unit.create({
      data: {
        complexId: d.complexId,
        code: d.code,
        floor: d.floor || null,
        ownershipCoefficient: d.ownershipCoefficient,
        areaM2: typeof d.areaM2 === "number" ? d.areaM2 : null,
        rooms: typeof d.rooms === "number" ? d.rooms : null,
        bathrooms: typeof d.bathrooms === "number" ? d.bathrooms : null,
      },
    });
  } catch {
    return { ok: false, error: "No se pudo crear la unidad (¿código duplicado?)" };
  }

  revalidatePath(`/complejos/${d.complexId}`);
  return { ok: true };
}
