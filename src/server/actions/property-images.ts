"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import {
  publicPropertiesPath,
  publicPropertyPath,
  publicStorefrontPath,
} from "@/lib/public-org";
import { storage } from "@/lib/storage";
import type { ActionResult } from "@/server/actions/users";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

async function revalidatePublicProperty(property: {
  slug: string;
  organizationId: string | null;
  id: string;
}) {
  if (!property.organizationId) {
    revalidatePath(`/gestion/propiedades/${property.id}`);
    revalidatePath("/gestion/propiedades");
    return;
  }
  const org = await prisma.organization.findUnique({
    where: { id: property.organizationId },
    select: { slug: true },
  });
  revalidatePath(`/gestion/propiedades/${property.id}`);
  revalidatePath("/gestion/propiedades");
  if (!org) return;
  revalidatePath(publicStorefrontPath(org.slug), "layout");
  revalidatePath(publicPropertiesPath(org.slug));
  revalidatePath(publicPropertyPath(org.slug, property.slug));
}

export async function uploadPropertyImagesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) return { ok: false, error: "Propiedad requerida" };

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) return { ok: false, error: "Propiedad no encontrada" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return { ok: false, error: "Seleccioná al menos una imagen" };
  }

  const existingCount = await prisma.propertyImage.count({ where: { propertyId } });
  let sortOrder = existingCount;
  let coverAssigned = existingCount > 0;

  for (const file of files) {
    if (!ALLOWED.has(file.type)) {
      return { ok: false, error: `Formato no permitido: ${file.name}` };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: `${file.name} supera 8MB` };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isCover = !coverAssigned;
    const created = await prisma.propertyImage.create({
      data: {
        propertyId,
        url: "",
        alt: property.title,
        sortOrder,
        isCover,
        contentType: file.type || "image/jpeg",
        data: buffer,
      },
    });
    await prisma.propertyImage.update({
      where: { id: created.id },
      data: { url: `/api/media/property-images/${created.id}` },
    });
    if (isCover) coverAssigned = true;
    sortOrder += 1;
  }

  await revalidatePublicProperty(property);
  return { ok: true, message: `${files.length} imagen(es) subida(s)` };
}

export async function deletePropertyImageAction(imageId: string): Promise<ActionResult> {
  await requireStaff();
  const image = await prisma.propertyImage.findUnique({
    where: { id: imageId },
    include: { property: true },
  });
  if (!image) return { ok: false, error: "Imagen no encontrada" };

  if (image.url.startsWith("/uploads/")) {
    const key = image.url.replace(/^\/uploads\//, "");
    await storage.delete(key);
  }
  await prisma.propertyImage.delete({ where: { id: imageId } });

  if (image.isCover) {
    const next = await prisma.propertyImage.findFirst({
      where: { propertyId: image.propertyId },
      orderBy: { sortOrder: "asc" },
    });
    if (next) {
      await prisma.propertyImage.update({
        where: { id: next.id },
        data: { isCover: true },
      });
    }
  }

  await revalidatePublicProperty(image.property);
  return { ok: true };
}

export async function setCoverPropertyImageAction(imageId: string): Promise<ActionResult> {
  await requireStaff();
  const image = await prisma.propertyImage.findUnique({
    where: { id: imageId },
    include: { property: true },
  });
  if (!image) return { ok: false, error: "Imagen no encontrada" };

  await prisma.$transaction([
    prisma.propertyImage.updateMany({
      where: { propertyId: image.propertyId },
      data: { isCover: false },
    }),
    prisma.propertyImage.update({
      where: { id: imageId },
      data: { isCover: true },
    }),
  ]);

  await revalidatePublicProperty(image.property);
  return { ok: true };
}
