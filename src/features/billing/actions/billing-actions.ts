"use server";

import { revalidatePath } from "next/cache";
import type { BillingPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthSession } from "@/lib/auth";
import { normalizeOrgSlug } from "@/features/auth/lib/org-slug";
import {
  setLocalSessionCookie,
  signLocalSession,
} from "@/features/auth/lib/session";
import { activateBillingPayment } from "@/features/billing/lib/activate";
import {
  BILLING_PLANS,
  BILLING_TIERS,
  normalizeBillingPlanId,
  type BillingPlanId,
} from "@/features/billing/lib/plans";

export type BillingActionResult =
  | { ok: true; paymentId?: string; redirectTo?: string }
  | { ok: false; error: string };

export async function listPlans() {
  return {
    plans: BILLING_PLANS,
    tiers: BILLING_TIERS,
  };
}

export async function startTrialPayment(input: {
  planId: BillingPlanId;
  companyName: string;
  companySlug?: string;
}): Promise<BillingActionResult> {
  try {
    const session = await requireAuthSession();
    const plan = normalizeBillingPlanId(input.planId);
    if (!plan || plan !== "TRIAL") {
      return { ok: false, error: "Plan de prueba inválido." };
    }

    const companyName = input.companyName.trim();
    if (companyName.length < 2) {
      return { ok: false, error: "Indicá el nombre de la inmobiliaria." };
    }

    const companySlug = normalizeOrgSlug(
      input.companySlug?.trim() || companyName,
    );

    const payment = await prisma.billingPayment.create({
      data: {
        userId: session.user.id,
        plan: plan as BillingPlan,
        method: "TRANSFER",
        currency: "USD",
        amount: 0,
        companyName,
        companySlug,
        status: "PENDING",
      },
    });

    await activateBillingPayment(payment.id);

    const approved = await prisma.billingPayment.findUnique({
      where: { id: payment.id },
      select: { organizationId: true },
    });

    if (approved?.organizationId) {
      const token = await signLocalSession({
        userId: session.user.id,
        organizationId: approved.organizationId,
        email: session.user.email,
      });
      await setLocalSessionCookie(token);
    }

    revalidatePath("/", "layout");
    return { ok: true, paymentId: payment.id, redirectTo: "/dashboard" };
  } catch (error) {
    console.error("startTrialPayment", error);
    return { ok: false, error: "No se pudo activar la prueba." };
  }
}

export async function createTransferPayment(input: {
  planId: BillingPlanId;
  companyName: string;
  companySlug?: string;
  notes?: string;
}): Promise<BillingActionResult> {
  try {
    const session = await requireAuthSession();
    const plan = normalizeBillingPlanId(input.planId);
    if (!plan || plan === "TRIAL") {
      return { ok: false, error: "Plan inválido para transferencia." };
    }

    const companyName = input.companyName.trim();
    if (companyName.length < 2) {
      return { ok: false, error: "Indicá el nombre de la inmobiliaria." };
    }

    const def = BILLING_PLANS[plan];
    const payment = await prisma.billingPayment.create({
      data: {
        userId: session.user.id,
        plan: plan as BillingPlan,
        method: "TRANSFER",
        currency: "USD",
        amount: def.priceUsd,
        companyName,
        companySlug: normalizeOrgSlug(
          input.companySlug?.trim() || companyName,
        ),
        notes: input.notes?.trim() || null,
        status: "PENDING",
      },
    });

    revalidatePath("/onboarding/pago");
    return { ok: true, paymentId: payment.id, redirectTo: "/onboarding/pago" };
  } catch (error) {
    console.error("createTransferPayment", error);
    return { ok: false, error: "No se pudo registrar el pago." };
  }
}

export async function startTrialOrPaidCheckout(input: {
  plan: BillingPlanId;
  companyName: string;
  companySlug?: string;
  method: "TRIAL" | "TRANSFER";
}): Promise<BillingActionResult> {
  if (input.plan === "TRIAL" || input.method === "TRIAL") {
    return startTrialPayment({
      planId: "TRIAL",
      companyName: input.companyName,
      companySlug: input.companySlug,
    });
  }

  return createTransferPayment({
    planId: input.plan,
    companyName: input.companyName,
    companySlug: input.companySlug,
  });
}
