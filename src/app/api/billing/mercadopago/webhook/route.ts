import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activateBillingPayment } from "@/features/billing/lib/activate";
import { getMercadoPagoAccessToken } from "@/features/billing/lib/platform-billing-settings";

export const dynamic = "force-dynamic";

/**
 * Stub webhook Mercado Pago.
 * Cuando llega un pago aprobado con external_reference = BillingPayment.id,
 * activa el plan. Sin token configurado responde 503.
 */
export async function POST(request: NextRequest) {
  const token = await getMercadoPagoAccessToken();
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  try {
    const url = request.nextUrl;
    const topic =
      url.searchParams.get("type") ||
      url.searchParams.get("topic") ||
      "";
    const dataId =
      url.searchParams.get("data.id") ||
      url.searchParams.get("id") ||
      "";

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      /* query-only notifications */
    }

    const paymentId =
      dataId ||
      (typeof body.data === "object" &&
      body.data &&
      "id" in body.data &&
      body.data.id != null
        ? String(body.data.id)
        : "") ||
      (typeof body.id === "string" || typeof body.id === "number"
        ? String(body.id)
        : "");

    const isPayment =
      topic === "payment" ||
      body.type === "payment" ||
      body.action === "payment.updated" ||
      Boolean(paymentId);

    if (!isPayment || !paymentId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      console.warn("MP webhook: fetch payment failed", paymentId, res.status);
      return NextResponse.json({ ok: true, fetchFailed: true });
    }

    const mp = (await res.json()) as {
      status?: string;
      external_reference?: string | null;
      id?: number | string;
    };

    if (mp.status !== "approved" || !mp.external_reference) {
      return NextResponse.json({ ok: true, status: mp.status ?? null });
    }

    const payment = await prisma.billingPayment.findUnique({
      where: { id: mp.external_reference },
    });
    if (!payment) {
      console.warn("MP webhook: payment not found", mp.external_reference);
      return NextResponse.json({ ok: true, missing: true });
    }
    if (payment.status !== "APPROVED") {
      await activateBillingPayment(payment.id, {
        mpPaymentId: String(mp.id ?? paymentId),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("MP webhook", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "mercadopago-webhook" });
}
