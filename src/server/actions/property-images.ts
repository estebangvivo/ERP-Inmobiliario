"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { storage } from "@/lib/storage";
import type { ActionResult } from "@/server/actions/users";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

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
    const stored = await storage.put({
      buffer,
      filename: file.name,
      contentType: file.type,
      folder: `properties/${propertyId}`,
    });

    const isCover = !coverAssigned;
    await prisma.propertyImage.create({
      data: {
        propertyId,
        url: stored.url,
        alt: property.title,
        sortOrder,
        isCover,
      },
    });
    if (isCover) coverAssigned = true;
    sortOrder += 1;
  }

  revalidatePath(`/gestion/propiedades/${propertyId}`);
  revalidatePath(`/propiedades/${property.slug}`);
  revalidatePath("/propiedades");
  revalidatePath("/gestion/propiedades");
  return { ok: true, message: `${files.length} imagen(es) subida(s)` };
}

export async function deletePropertyImageAction(imageId: string): Promise<ActionResult> {
  await requireStaff();
  const image = await prisma.propertyImage.findUnique({
    where: { id: imageId },
    include: { property: true },
  });
  if (!image) return { ok: false, error: "Imagen no encontrada" };

  const key = image.url.replace(/^\/uploads\//, "");
  await storage.delete(key);
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

  revalidatePath(`/gestion/propiedades/${image.propertyId}`);
  revalidatePath(`/propiedades/${image.property.slug}`);
  revalidatePath("/propiedades");
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

  revalidatePath(`/gestion/propiedades/${image.propertyId}`);
  revalidatePath(`/propiedades/${image.property.slug}`);
  revalidatePath("/propiedades");
  return { ok: true };
}
