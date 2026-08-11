"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff, slugify } from "@/lib/session";
import {
  publicPropertiesPath,
  publicPropertyPath,
  publicStorefrontPath,
} from "@/lib/public-org";
import {
  propertyCreateSchema,
  propertyUpdateSchema,
} from "@/server/validators/property";
import type { ActionResult } from "@/server/actions/users";

async function revalidatePublicCatalog(
  organizationId: string,
  propertySlug?: string,
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!org) return;
  revalidatePath(publicStorefrontPath(org.slug), "layout");
  revalidatePath(publicPropertiesPath(org.slug));
  if (propertySlug) {
    revalidatePath(publicPropertyPath(org.slug, propertySlug));
  }
}

function formDataToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function emptyToUndef<T>(v: T | "" | undefined): T | undefined {
  return v === "" || v === undefined ? undefined : v;
}

async function uniqueSlug(base: string, organizationId: string, excludeId?: string) {
  const slug = slugify(base) || `propiedad-${Date.now()}`;
  let i = 0;
  while (true) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const found = await prisma.property.findUnique({
      where: { organizationId_slug: { organizationId, slug: candidate } },
    });
    if (!found || found.id === excludeId) return candidate;
    i += 1;
  }
}

export async function createPropertyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = propertyCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const d = parsed.data;
  const slug = await uniqueSlug(d.title, session.organizationId);
  const amenities = (d.amenities ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await prisma.property.create({
    data: {
      organizationId: session.organizationId,
      title: d.title,
      slug,
      description: emptyToUndef(d.description) ?? null,
      propertyType: d.propertyType,
      operationType: d.operationType,
      status: d.status,
      price: d.price,
      currency: d.currency,
      address: d.address,
      city: d.city,
      province: emptyToUndef(d.province) ?? null,
      rooms: typeof d.rooms === "number" ? d.rooms : null,
      bathrooms: typeof d.bathrooms === "number" ? d.bathrooms : null,
      areaM2: typeof d.areaM2 === "number" ? d.areaM2 : null,
      amenities,
      videoUrl: emptyToUndef(d.videoUrl) ?? null,
      unitId: emptyToUndef(d.unitId) ?? null,
      publishedAt: d.listedPublic ? new Date() : null,
      images: d.coverImageUrl
        ? {
            create: [
              {
                url: d.coverImageUrl,
                alt: d.title,
                isCover: true,
                sortOrder: 0,
              },
            ],
          }
        : undefined,
      ownerships: d.ownerId
        ? {
            create: [{ ownerId: d.ownerId, sharePct: 100, isPrimary: true }],
          }
        : undefined,
    },
  });

  revalidatePath("/gestion/propiedades");
  await revalidatePublicCatalog(session.organizationId, slug);
  return { ok: true };
}

export async function updatePropertyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = propertyUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const d = parsed.data;
  const existing = await prisma.property.findFirst({
    where: { id: d.id, organizationId: session.organizationId },
  });
  if (!existing) {
    return { ok: false, error: "Propiedad no encontrada." };
  }

  const amenities = (d.amenities ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await prisma.property.update({
    where: { id: d.id },
    data: {
      title: d.title,
      description: emptyToUndef(d.description) ?? null,
      propertyType: d.propertyType,
      operationType: d.operationType,
      status: d.status,
      price: d.price,
      currency: d.currency,
      address: d.address,
      city: d.city,
      province: emptyToUndef(d.province) ?? null,
      rooms: typeof d.rooms === "number" ? d.rooms : null,
      bathrooms: typeof d.bathrooms === "number" ? d.bathrooms : null,
      areaM2: typeof d.areaM2 === "number" ? d.areaM2 : null,
      amenities,
      videoUrl: emptyToUndef(d.videoUrl) ?? null,
      unitId: emptyToUndef(d.unitId) ?? null,
      publishedAt: d.listedPublic
        ? existing.publishedAt ?? new Date()
        : null,
    },
  });

  if (d.ownerId) {
    await prisma.propertyOwnership.deleteMany({ where: { propertyId: d.id } });
    await prisma.propertyOwnership.create({
      data: {
        propertyId: d.id,
        ownerId: d.ownerId,
        sharePct: 100,
        isPrimary: true,
      },
    });
  }

  revalidatePath("/gestion/propiedades");
  revalidatePath(`/gestion/propiedades/${d.id}`);
  await revalidatePublicCatalog(session.organizationId, existing.slug);
  return { ok: true };
}

export async function togglePropertyPublicAction(
  propertyId: string,
  listedPublic: boolean,
): Promise<ActionResult> {
  const session = await requireStaff();
  const existing = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: session.organizationId },
    select: { id: true, slug: true, publishedAt: true },
  });
  if (!existing) {
    return { ok: false, error: "Propiedad no encontrada." };
  }

  await prisma.property.update({
    where: { id: existing.id },
    data: {
      publishedAt: listedPublic
        ? existing.publishedAt ?? new Date()
        : null,
    },
  });

  revalidatePath("/gestion/propiedades");
  revalidatePath(`/gestion/propiedades/${existing.id}`);
  await revalidatePublicCatalog(session.organizationId, existing.slug);
  return { ok: true };
}
