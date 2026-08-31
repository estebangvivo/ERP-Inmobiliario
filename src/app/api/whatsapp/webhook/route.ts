import { NextRequest, NextResponse } from "next/server";
import {
  verifyWhatsAppWebhookToken,
} from "@/features/whatsapp/lib/config";
import { processWhatsAppWebhookPayload } from "@/features/whatsapp/services/webhook-processor";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const valid = await verifyWhatsAppWebhookToken(token);
  if (!valid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Parameters<
      typeof processWhatsAppWebhookPayload
    >[0];
    const { processed } = await processWhatsAppWebhookPayload(payload);
    return NextResponse.json({ ok: true, processed });
  } catch (error) {
    console.error("whatsapp webhook POST", error);
    return NextResponse.json({ ok: true, error: true });
  }
}
