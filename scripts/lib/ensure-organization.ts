import type { BillingPlan, BillingStatus, PrismaClient } from "@prisma/client";

type EnsureOrgInput = {
  slug: string;
  name: string;
  email?: string;
  city?: string;
  province?: string;
  country?: string;
  billingStatus?: BillingStatus;
  billingPlan?: BillingPlan;
};

export async function ensureOrganization(
  prisma: PrismaClient,
  input: EnsureOrgInput,
): Promise<{ id: string }> {
  const org = await prisma.organization.upsert({
    where: { slug: input.slug },
    update: {
      name: input.name,
      ...(input.billingStatus ? { billingStatus: input.billingStatus } : {}),
      ...(input.billingPlan ? { billingPlan: input.billingPlan } : {}),
    },
    create: {
      name: input.name,
      slug: input.slug,
      email: input.email,
      city: input.city,
      province: input.province,
      country: input.country ?? "AR",
      billingStatus: input.billingStatus ?? "PENDING_PAYMENT",
      billingPlan: input.billingPlan,
    },
    select: { id: true },
  });

  return org;
}
