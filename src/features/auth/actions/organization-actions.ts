"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  getSession,
  requireAuthSession,
  hasOrganization,
} from "@/lib/auth";
import {
  setLocalSessionCookie,
  signLocalSession,
} from "@/features/auth/lib/session";
import { normalizeOrgSlug } from "@/features/auth/lib/org-slug";
import { isPlatformSuperadmin } from "@/features/auth/lib/platform-admin";

export type OrgActionResult =
  | { ok: true; organizationId?: string }
  | { ok: false; error: string };

export type MyOrganization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  isActive: boolean;
};

export async function listMyOrganizations(): Promise<MyOrganization[]> {
  const session = await getSession();
  if (!session) return [];

  if (isPlatformSuperadmin(session)) {
    const orgs = await prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });
    return orgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      role: "ADMIN",
      isActive: org.id === session.organizationId,
    }));
  }

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: session.user.id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role,
    isActive: m.organizationId === session.organizationId,
  }));
}

export async function switchOrganization(
  organizationId: string,
): Promise<OrgActionResult> {
  try {
    const session = await requireAuthSession();
    const superadmin = isPlatformSuperadmin(session);

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: session.user.id,
        },
      },
    });

    if (!membership && !superadmin) {
      return { ok: false, error: "No pertenecés a esa empresa." };
    }

    if (!membership && superadmin) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!org) return { ok: false, error: "Empresa no encontrada." };
    }

    const targetOrgId = membership?.organizationId ?? organizationId;
    const token = await signLocalSession({
      userId: session.user.id,
      organizationId: targetOrgId,
      email: session.user.email,
    });
    await setLocalSessionCookie(token);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastActivityAt: new Date() },
    });
    revalidatePath("/", "layout");
    return { ok: true, organizationId: targetOrgId };
  } catch (error) {
    console.error("switchOrganization", error);
    return { ok: false, error: "No se pudo cambiar de empresa." };
  }
}

export async function clearActiveOrganization(): Promise<OrgActionResult> {
  try {
    const session = await requireAuthSession();
    if (!isPlatformSuperadmin(session)) {
      return {
        ok: false,
        error: "Solo el superadmin puede salir a modo plataforma.",
      };
    }
    const token = await signLocalSession({
      userId: session.user.id,
      organizationId: null,
      email: session.user.email,
    });
    await setLocalSessionCookie(token);
    revalidatePath("/", "layout");
    revalidatePath("/admin");
    revalidatePath("/select-organization");
    return { ok: true };
  } catch (error) {
    console.error("clearActiveOrganization", error);
    return { ok: false, error: "No se pudo volver al modo plataforma." };
  }
}

export async function createOrganization(input: {
  name: string;
  slug?: string;
  switchTo?: boolean;
}): Promise<OrgActionResult> {
  try {
    const session = await requireAuthSession();
    const superadmin = isPlatformSuperadmin(session);
    if (!superadmin && !hasOrganization(session)) {
      return { ok: false, error: "Iniciá sesión." };
    }

    const name = input.name.trim();
    if (name.length < 2) {
      return { ok: false, error: "Indicá el nombre de la empresa." };
    }

    const slug = normalizeOrgSlug(input.slug?.trim() || name);
    if (slug.length < 2) {
      return {
        ok: false,
        error: "El identificador (slug) debe tener al menos 2 caracteres.",
      };
    }

    const taken = await prisma.organization.findUnique({ where: { slug } });
    if (taken) {
      return {
        ok: false,
        error: "Ese identificador ya está en uso. Probá otro slug.",
      };
    }

    const org = await prisma.organization.create({
      data: {
        name,
        slug,
        country: "AR",
        billingStatus: "EXEMPT",
        members: {
          create: {
            userId: session.user.id,
            role: "ADMIN",
            allowedModules: [],
          },
        },
      },
    });

    if (input.switchTo !== false) {
      const token = await signLocalSession({
        userId: session.user.id,
        organizationId: org.id,
        email: session.user.email,
      });
      await setLocalSessionCookie(token);
    }
    revalidatePath("/", "layout");
    revalidatePath("/admin");
    revalidatePath("/select-organization");
    return { ok: true, organizationId: org.id };
  } catch (error) {
    console.error("createOrganization", error);
    return { ok: false, error: "No se pudo crear la empresa." };
  }
}
