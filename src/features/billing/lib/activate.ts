import type { BillingPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeOrgSlug } from "@/features/auth/lib/org-slug";
import {
  addBillingPeriod,
  normalizeBillingPlanId,
  type BillingPlanId,
} from "@/features/billing/lib/plans";

export async function activateBillingPayment(
  paymentId: string,
  opts?: { approvedById?: string; mpPaymentId?: string },
) {
  const updated = await prisma.$transaction(async (tx) => {
    const payment = await tx.billingPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new Error("Pago no encontrado");
    if (payment.status === "APPROVED") {
      return { payment, freshlyApproved: false };
    }
    if (payment.status === "REJECTED") {
      throw new Error("El pago fue rechazado");
    }

    const plan =
      normalizeBillingPlanId(payment.plan) ?? ("TEAM_MONTHLY" as BillingPlanId);
    const now = new Date();
    let organizationId = payment.organizationId;

    if (!organizationId) {
      const name = (payment.companyName ?? "Mi Inmobiliaria").trim();
      let slug = normalizeOrgSlug(payment.companySlug || name);
      if (slug.length < 2) slug = `org-${payment.userId.slice(-8)}`;

      const taken = await tx.organization.findUnique({ where: { slug } });
      if (taken) {
        slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      }

      const periodEnd = addBillingPeriod(now, plan);
      const org = await tx.organization.create({
        data: {
          name,
          slug,
          country: "AR",
          billingStatus: "ACTIVE",
          billingPlan: plan as BillingPlan,
          paidUntil: periodEnd,
          members: {
            create: {
              userId: payment.userId,
              role: "ADMIN",
              allowedModules: [],
            },
          },
        },
      });
      organizationId = org.id;

      const approved = await tx.billingPayment.update({
        where: { id: payment.id },
        data: {
          status: "APPROVED",
          organizationId,
          approvedById: opts?.approvedById ?? null,
          mpPaymentId: opts?.mpPaymentId ?? payment.mpPaymentId,
          periodStart: now,
          periodEnd,
        },
      });
      return { payment: approved, freshlyApproved: true };
    }

    const org = await tx.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) throw new Error("Empresa no encontrada");

    const base =
      org.paidUntil && org.paidUntil.getTime() > now.getTime()
        ? org.paidUntil
        : now;
    const periodEnd = addBillingPeriod(base, plan);

    await tx.organization.update({
      where: { id: organizationId },
      data: {
        billingStatus: "ACTIVE",
        billingPlan: plan as BillingPlan,
        paidUntil: periodEnd,
      },
    });

    const approved = await tx.billingPayment.update({
      where: { id: payment.id },
      data: {
        status: "APPROVED",
        approvedById: opts?.approvedById ?? null,
        mpPaymentId: opts?.mpPaymentId ?? payment.mpPaymentId,
        periodStart: base,
        periodEnd,
      },
    });
    return { payment: approved, freshlyApproved: true };
  });

  return updated.payment;
}

export async function markOrganizationPastDueIfNeeded(
  organizationId: string,
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { billingStatus: true, paidUntil: true },
  });
  if (!org || org.billingStatus === "EXEMPT") return;
  if (org.paidUntil && org.paidUntil.getTime() <= Date.now()) {
    if (org.billingStatus !== "PAST_DUE") {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { billingStatus: "PAST_DUE" },
      });
    }
  }
}
