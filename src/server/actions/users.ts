"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgAdmin } from "@/lib/session";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/** @deprecated Usar user-actions.ts — mantenido para compatibilidad de formularios legacy. */
export async function createUserAction(): Promise<ActionResult> {
  return { ok: false, error: "Usá el panel de usuarios en /usuarios." };
}

/** @deprecated Usar user-actions.ts */
export async function updateUserAction(): Promise<ActionResult> {
  return { ok: false, error: "Usá el panel de usuarios en /usuarios." };
}

export async function toggleUserActiveAction(id: string): Promise<ActionResult> {
  const session = await requireOrgAdmin();
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: session.organizationId,
        userId: id,
      },
    },
    include: { user: true },
  });
  if (!membership) return { ok: false, error: "Usuario no encontrado" };

  await prisma.user.update({
    where: { id },
    data: { isActive: !membership.user.isActive },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}
