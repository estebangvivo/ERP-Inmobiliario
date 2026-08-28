"use server";

import { revalidatePath } from "next/cache";
import type { BillingPlan, BillingStatus, OrganizationRole } from "@prisma/client";
import { parseDateInput } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { requireAdminPanelSession } from "@/lib/auth";
import { normalizeBillingPlanId } from "@/features/billing/lib/plans";
import { ROLE_DEFAULT_MODULES } from "@/features/auth/lib/modules";
import { isUserOnline } from "@/features/auth/lib/presence";

export type AdminOrgOverview = {
  id: string;
  name: string;
  slug: string;
  billingStatus: BillingStatus;
  billingPlan: BillingPlan | null;
  paidUntil: string | null;
  memberCount: number;
  createdAt: string;
};

export type AdminOrganizationMemberOverview = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  isActive: boolean;
  allowedModules: string[];
  lastSeenAt: string | null;
  isOnline: boolean;
};

export type AdminOrganizationOverview = {
  id: string;
  name: string;
  slug: string;
  billingStatus: BillingStatus;
  billingPlan: BillingPlan | null;
  paidUntil: string | null;
  memberCount: number;
  onlineCount: number;
  members: AdminOrganizationMemberOverview[];
};

export type AdminActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function listAdminOrganizationsOverview(): Promise<
  AdminOrgOverview[]
> {
  await requireAdminPanelSession();

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { members: true } } },
  });

  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    billingStatus: o.billingStatus,
    billingPlan: o.billingPlan,
    paidUntil: o.paidUntil ? o.paidUntil.toISOString() : null,
    memberCount: o._count.members,
    createdAt: o.createdAt.toISOString(),
  }));
}

/** Empresas con miembros y estado de conexión (presencia). */
export async function listAdminOrganizationsPresenceOverview(): Promise<
  AdminOrganizationOverview[]
> {
  await requireAdminPanelSession();

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isActive: true,
              lastSeenAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const now = Date.now();

  return orgs.map((org) => {
    const members: AdminOrganizationMemberOverview[] = org.members
      .map((m) => {
        const lastSeenAt = m.user.lastSeenAt?.toISOString() ?? null;
        const isOnline = isUserOnline(m.user.lastSeenAt, now);
        return {
          membershipId: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          isActive: m.user.isActive,
          allowedModules:
            m.allowedModules.length > 0
              ? m.allowedModules
              : [...ROLE_DEFAULT_MODULES[m.role]],
          lastSeenAt,
          isOnline,
        };
      })
      .sort((a, b) => {
        const aOn = a.isOnline && a.isActive ? 1 : 0;
        const bOn = b.isOnline && b.isActive ? 1 : 0;
        if (bOn !== aOn) return bOn - aOn;
        return a.email.localeCompare(b.email, "es");
      });

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      billingStatus: org.billingStatus,
      billingPlan: org.billingPlan,
      paidUntil: org.paidUntil?.toISOString() ?? null,
      memberCount: members.length,
      onlineCount: members.filter((m) => m.isOnline && m.isActive).length,
      members,
    };
  });
}

export async function updateOrganizationBillingBySuperadmin(input: {
  organizationId: string;
  billingStatus: BillingStatus;
  billingPlan?: BillingPlan | null;
  paidUntil?: string | null;
}): Promise<AdminActionResult> {
  try {
    await requireAdminPanelSession();

    const plan = input.billingPlan
      ? normalizeBillingPlanId(input.billingPlan)
      : null;

    let paidUntil: Date | null = null;
    if (input.paidUntil?.trim()) {
      paidUntil = parseDateInput(input.paidUntil.trim());
      if (!paidUntil) {
        return { ok: false, error: "Fecha de vencimiento inválida." };
      }
    }

    await prisma.organization.update({
      where: { id: input.organizationId },
      data: {
        billingStatus: input.billingStatus,
        billingPlan: plan as BillingPlan | undefined,
        paidUntil,
      },
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("updateOrganizationBillingBySuperadmin", error);
    return { ok: false, error: "No se pudo actualizar la facturación." };
  }
}
