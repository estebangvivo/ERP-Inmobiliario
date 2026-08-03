"use server";

import { revalidatePath } from "next/cache";
import type { BillingPlan, BillingStatus, OrganizationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminPanelSession } from "@/lib/auth";
import { normalizeBillingPlanId } from "@/features/billing/lib/plans";

export type AdminOrgOverview = {
  id: string;
  name: string;
  slug: string;
  billingStatus: BillingStatus;
  billingPlan: BillingPlan | null;
  paidUntil: Date | null;
  memberCount: number;
  createdAt: Date;
};

export type AdminOrganizationMemberOverview = {
  membershipId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  isActive: boolean;
  allowedModules: string[];
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
    paidUntil: o.paidUntil,
    memberCount: o._count.members,
    createdAt: o.createdAt,
  }));
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

    await prisma.organization.update({
      where: { id: input.organizationId },
      data: {
        billingStatus: input.billingStatus,
        billingPlan: plan as BillingPlan | undefined,
        paidUntil: input.paidUntil ? new Date(input.paidUntil) : null,
      },
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("updateOrganizationBillingBySuperadmin", error);
    return { ok: false, error: "No se pudo actualizar la facturación." };
  }
}
