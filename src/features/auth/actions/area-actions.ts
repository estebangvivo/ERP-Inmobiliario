"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuthSession } from "@/lib/auth";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";
import { parseAreaKeywords } from "@/features/auth/lib/areas";

export type AreaActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export type AreaRow = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  isActive: boolean;
  memberCount: number;
};

async function requireAreaAdmin(): Promise<string> {
  const session = await requireAuthSession();
  const isSuper = isPlatformSuperadminEmail(session.user.email);
  if (!session.organizationId) throw new Error("FORBIDDEN");
  if (!isSuper && session.organizationRole !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return session.organizationId;
}

function revalidateAreas() {
  revalidatePath("/usuarios");
  revalidatePath("/usuarios/areas");
}

export async function listAreas(): Promise<AreaRow[]> {
  const orgId = await requireAreaAdmin();
  const areas = await prisma.area.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { members: true } } },
  });
  return areas.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    keywords: a.keywords,
    isActive: a.isActive,
    memberCount: a._count.members,
  }));
}

/** Áreas activas para el selector del alta/edición de usuarios. */
export async function listActiveAreaOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  const orgId = await requireAreaAdmin();
  return prisma.area.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function saveArea(input: {
  id?: string;
  name: string;
  description?: string;
  keywords?: string;
  isActive?: boolean;
}): Promise<AreaActionResult> {
  try {
    const orgId = await requireAreaAdmin();
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) return { ok: false, error: "Nombre requerido." };
    if (name.length > 60) {
      return { ok: false, error: "El nombre no puede superar 60 caracteres." };
    }
    const description = input.description?.trim() || null;
    const keywords = parseAreaKeywords(input.keywords ?? "");

    const duplicate = await prisma.area.findFirst({
      where: {
        organizationId: orgId,
        name: { equals: name, mode: "insensitive" },
        ...(input.id ? { NOT: { id: input.id } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      return { ok: false, error: "Ya existe un área con ese nombre." };
    }

    if (input.id) {
      const existing = await prisma.area.findFirst({
        where: { id: input.id, organizationId: orgId },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "Área no encontrada." };
      await prisma.area.update({
        where: { id: input.id },
        data: {
          name,
          description,
          keywords,
          ...(typeof input.isActive === "boolean"
            ? { isActive: input.isActive }
            : {}),
        },
      });
      revalidateAreas();
      return { ok: true, id: input.id };
    }

    const created = await prisma.area.create({
      data: { organizationId: orgId, name, description, keywords },
    });
    revalidateAreas();
    return { ok: true, id: created.id };
  } catch (error) {
    console.error("saveArea", error);
    return { ok: false, error: "No se pudo guardar el área." };
  }
}

export async function deleteArea(id: string): Promise<AreaActionResult> {
  try {
    const orgId = await requireAreaAdmin();
    const area = await prisma.area.findFirst({
      where: { id, organizationId: orgId },
      include: { _count: { select: { members: true } } },
    });
    if (!area) return { ok: false, error: "Área no encontrada." };
    if (area._count.members > 0) {
      return {
        ok: false,
        error: `No se puede eliminar: ${area._count.members} usuario(s) pertenecen a esta área. Reasignalos o desactivá el área.`,
      };
    }
    await prisma.area.delete({ where: { id } });
    revalidateAreas();
    return { ok: true };
  } catch (error) {
    console.error("deleteArea", error);
    return { ok: false, error: "No se pudo eliminar el área." };
  }
}
