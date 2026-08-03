"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuthSession } from "@/lib/auth";
import { activateBillingPayment } from "@/features/billing/lib/activate";
import {
  setLocalSessionCookie,
  signLocalSession,
} from "@/features/auth/lib/session";
import { isPlatformSuperadmin } from "@/features/auth/lib/platform-admin";

function assertPlatformBillingAdmin(email: string) {
  if (!isPlatformSuperadmin({ user: { email } })) {
    throw new Error("FORBIDDEN");
  }
}

function mapPaymentRow(p: {
  id: string;
  plan: string;
  method: string;
  currency: string;
  amount: { toString(): string } | number;
  fxRateUsed: { toString(): string } | number | null;
  companyName: string | null;
  companySlug: string | null;
  organizationId: string | null;
  transferProofUrl: string | null;
  notes: string | null;
  status: string;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  createdAt: Date;
  user: { email: string; phone: string | null; name: string };
  organization: { id: string; name: string } | null;
}) {
  const amount = Number(p.amount);
  const currency = (p.currency || "USD").toUpperCase();
  return {
    id: p.id,
    plan: p.plan,
    method: p.method,
    currency,
    amount,
    amountUsd: currency === "USD" ? amount : null,
    amountArs: currency === "ARS" ? amount : null,
    fxRateUsed: p.fxRateUsed ? Number(p.fxRateUsed) : null,
    companyName: p.companyName,
    companySlug: p.companySlug,
    organizationId: p.organizationId,
    organizationName: p.organization?.name ?? null,
    transferProofUrl: p.transferProofUrl,
    notes: p.notes,
    status: p.status,
    mpPaymentId: p.mpPaymentId,
    mpPreferenceId: p.mpPreferenceId,
    createdAt: p.createdAt.toISOString(),
    userEmail: p.user.email,
    userPhone: p.user.phone,
    userName: p.user.name || p.user.email,
  };
}

const paymentInclude = {
  user: { select: { email: true, phone: true, name: true } },
  organization: { select: { id: true, name: true } },
} as const;

export async function listAdminBillingPayments(): Promise<{
  pendingTransfers: ReturnType<typeof mapPaymentRow>[];
  recent: ReturnType<typeof mapPaymentRow>[];
}> {
  const empty = { pendingTransfers: [], recent: [] };
  const session = await requireAuthSession();
  try {
    assertPlatformBillingAdmin(session.user.email);
  } catch {
    return empty;
  }

  const [pending, recent] = await Promise.all([
    prisma.billingPayment.findMany({
      where: { status: "PENDING", method: "TRANSFER" },
      include: paymentInclude,
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.billingPayment.findMany({
      include: paymentInclude,
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  return {
    pendingTransfers: pending.map((p) => mapPaymentRow(p)),
    recent: recent.map((p) => mapPaymentRow(p)),
  };
}

export type BillingReviewResult =
  | { ok: true; notifiedEmail: boolean; notifiedWhatsapp: boolean }
  | { ok: false; error: string };

export async function approveBillingPayment(
  paymentId: string,
): Promise<BillingReviewResult> {
  try {
    const session = await requireAuthSession();
    assertPlatformBillingAdmin(session.user.email);

    const updated = await activateBillingPayment(paymentId, {
      approvedById: session.user.id,
    });

    if (updated.organizationId && updated.userId === session.user.id) {
      const token = await signLocalSession({
        userId: session.user.id,
        organizationId: updated.organizationId,
        email: session.user.email,
      });
      await setLocalSessionCookie(token);
    }

    revalidatePath("/admin");
    revalidatePath("/onboarding/pago");
    revalidatePath("/", "layout");
    return { ok: true, notifiedEmail: false, notifiedWhatsapp: false };
  } catch (error) {
    console.error("approveBillingPayment", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo aprobar el pago.",
    };
  }
}

/** Alias usado por paneles anteriores. */
export async function approveBillingPaymentAction(paymentId: string) {
  return approveBillingPayment(paymentId);
}

export async function rejectBillingPayment(
  paymentId: string,
  reason?: string,
): Promise<BillingReviewResult> {
  try {
    const session = await requireAuthSession();
    assertPlatformBillingAdmin(session.user.email);

    const payment = await prisma.billingPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.status !== "PENDING") {
      return { ok: false, error: "Pago no pendiente." };
    }

    const trimmedReason = reason?.trim() || "";
    if (!trimmedReason) {
      return { ok: false, error: "Indicá el motivo del rechazo." };
    }

    await prisma.billingPayment.update({
      where: { id: paymentId },
      data: {
        status: "REJECTED",
        approvedById: session.user.id,
        notes: [payment.notes, `Rechazo: ${trimmedReason}`]
          .filter(Boolean)
          .join("\n"),
      },
    });

    if (payment.organizationId) {
      await prisma.organization.update({
        where: { id: payment.organizationId },
        data: { billingStatus: "PAST_DUE" },
      });
    }

    revalidatePath("/admin");
    revalidatePath("/onboarding/pago");
    return { ok: true, notifiedEmail: false, notifiedWhatsapp: false };
  } catch (error) {
    console.error("rejectBillingPayment", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo rechazar el pago.",
    };
  }
}
