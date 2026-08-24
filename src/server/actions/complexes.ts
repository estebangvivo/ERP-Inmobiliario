"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff, slugify } from "@/lib/session";
import {
  complexCreateSchema,
  complexUpdateSchema,
  unitCreateSchema,
} from "@/server/validators/complex";
import { LINKABLE_COMPLEX_PROPERTY_TYPES } from "@/server/validators/property";
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
  const session = await requireStaff();
  const parsed = unitCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const d = parsed.data;

  const complex = await prisma.complex.findFirst({
    where: { id: d.complexId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!complex) {
    return { ok: false, error: "Edificio no encontrado." };
  }

  const property = await prisma.property.findFirst({
    where: {
      id: d.propertyId,
      organizationId: session.organizationId,
      unitId: null,
      propertyType: { in: LINKABLE_COMPLEX_PROPERTY_TYPES },
    },
    select: {
      id: true,
      title: true,
      address: true,
      areaM2: true,
      rooms: true,
      bathrooms: true,
    },
  });
  if (!property) {
    return {
      ok: false,
      error: "La propiedad no existe, ya está en un edificio o no puede vincularse como unidad.",
    };
  }

  const baseCode = unitCodeFromProperty(property.title, property.address, property.id);
  let code = baseCode;
  let suffix = 2;
  while (
    await prisma.unit.findUnique({
      where: { complexId_code: { complexId: d.complexId, code } },
    })
  ) {
    code = `${baseCode.slice(0, 36)}-${suffix}`;
    suffix += 1;
  }

  const floor = guessFloorFromText(property.title, property.address);

  try {
    await prisma.$transaction(async (tx) => {
      const stillFree = await tx.property.findFirst({
        where: { id: property.id, unitId: null },
        select: { id: true },
      });
      if (!stillFree) {
        throw new Error("PROPERTY_TAKEN");
      }

      const unit = await tx.unit.create({
        data: {
          complexId: d.complexId,
          code,
          floor,
          ownershipCoefficient: d.ownershipCoefficient,
          areaM2: property.areaM2,
          rooms: property.rooms,
          bathrooms: property.bathrooms,
        },
      });

      await tx.property.update({
        where: { id: property.id },
        data: { unitId: unit.id },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PROPERTY_TAKEN") {
      return {
        ok: false,
        error: "Esa propiedad ya fue vinculada a otra unidad.",
      };
    }
    return { ok: false, error: "No se pudo crear la unidad." };
  }

  revalidatePath(`/complejos/${d.complexId}`);
  revalidatePath("/gestion/propiedades");
  revalidatePath(`/gestion/propiedades/${property.id}`);
  return { ok: true };
}

function unitCodeFromProperty(title: string, address: string, id: string): string {
  const t = title.trim();
  if (t.length >= 1 && t.length <= 40) return t;
  const left = address.split(" - ")[0]?.trim() || address.trim();
  if (left.length >= 1 && left.length <= 40) return left;
  return `U-${id.slice(-6)}`;
}

/** Intenta extraer piso de título/dirección (ej. "3 D", "Piso 2"). */
function guessFloorFromText(title: string, address: string): string | null {
  const text = `${title} ${address}`;
  const m = text.match(/\b(?:piso|planta)\s*(\d+[º°]?|\w+)/i);
  if (m?.[1]) return m[1]!.replace(/[º°]/, "");
  const m2 = text.match(/^(\d+)\s*[A-Za-z]/);
  if (m2?.[1]) return m2[1];
  return null;
}
