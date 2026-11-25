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

export async function createMercadoPagoCheckout(input: {
  planId: BillingPlanId;
  companyName: string;
  companySlug?: string;
}): Promise<BillingActionResult> {
  try {
    const session = await requireAuthSession();
    const plan = normalizeBillingPlanId(input.planId);
    if (!plan || plan === "TRIAL") {
      return { ok: false, error: "Plan inválido para Mercado Pago." };
    }

    const companyName = input.companyName.trim();
    if (companyName.length < 2) {
      return { ok: false, error: "Indicá el nombre de la inmobiliaria." };
    }

    const { getMercadoPagoAccessToken } = await import(
      "@/features/billing/lib/platform-billing-settings"
    );
    const token = await getMercadoPagoAccessToken();
    if (!token) {
      return {
        ok: false,
        error: "Mercado Pago no está configurado. Usá transferencia o contactá soporte.",
      };
    }

    const def = BILLING_PLANS[plan];
    const payment = await prisma.billingPayment.create({
      data: {
        userId: session.user.id,
        plan: plan as BillingPlan,
        method: "MERCADOPAGO",
        currency: "USD",
        amount: def.priceUsd,
        companyName,
        companySlug: normalizeOrgSlug(
          input.companySlug?.trim() || companyName,
        ),
        status: "PENDING",
      },
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "http://localhost:3001";

    const preferenceRes = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_reference: payment.id,
          items: [
            {
              title: `SimpleInmo · ${def.label}`,
              quantity: 1,
              currency_id: "USD",
              unit_price: def.priceUsd,
            },
          ],
          back_urls: {
            success: `${appUrl}/onboarding/pago?mp=success&paymentId=${payment.id}`,
            pending: `${appUrl}/onboarding/pago?mp=pending&paymentId=${payment.id}`,
            failure: `${appUrl}/onboarding/pago?mp=failure&paymentId=${payment.id}`,
          },
          auto_return: "approved",
          notification_url: `${appUrl}/api/billing/mercadopago/webhook`,
        }),
      },
    );

    if (!preferenceRes.ok) {
      const detail = await preferenceRes.text().catch(() => "");
      console.error("MP preference failed", preferenceRes.status, detail);
      await prisma.billingPayment.update({
        where: { id: payment.id },
        data: { status: "REJECTED", notes: "Fallo al crear preference MP" },
      });
      return {
        ok: false,
        error: "No se pudo iniciar el checkout de Mercado Pago.",
      };
    }

    const preference = (await preferenceRes.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
    };

    await prisma.billingPayment.update({
      where: { id: payment.id },
      data: { mpPreferenceId: preference.id ?? null },
    });

    const redirectTo =
      preference.init_point || preference.sandbox_init_point || undefined;
    if (!redirectTo) {
      return {
        ok: false,
        error: "Mercado Pago no devolvió URL de checkout.",
      };
    }

    revalidatePath("/onboarding/pago");
    return { ok: true, paymentId: payment.id, redirectTo };
  } catch (error) {
    console.error("createMercadoPagoCheckout", error);
    return { ok: false, error: "No se pudo iniciar Mercado Pago." };
  }
}

export async function startTrialOrPaidCheckout(input: {
  plan: BillingPlanId;
  companyName: string;
  companySlug?: string;
  method: "TRIAL" | "TRANSFER" | "MERCADOPAGO";
}): Promise<BillingActionResult> {
  if (input.plan === "TRIAL" || input.method === "TRIAL") {
    return startTrialPayment({
      planId: "TRIAL",
      companyName: input.companyName,
      companySlug: input.companySlug,
    });
  }

  if (input.method === "MERCADOPAGO") {
    return createMercadoPagoCheckout({
      planId: input.plan,
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
