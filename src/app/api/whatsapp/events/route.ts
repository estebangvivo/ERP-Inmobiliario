import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { hasModule } from "@/features/auth/lib/modules";
import { isStaffRole } from "@/lib/session";
import { subscribeWhatsAppInbox } from "@/features/whatsapp/lib/event-bus";
import type { WhatsAppInboxEvent } from "@/features/whatsapp/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events para notificar al inbox de agentes en tiempo real.
 * Alternativa compatible con Next.js App Router (sin Socket.io dedicado).
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (
    !session?.organizationId ||
    !isStaffRole(session.organizationRole) ||
    (session.organizationRole !== "ADMIN" &&
      !hasModule(session.allowedModules, "whatsapp"))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const organizationId = session.organizationId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: WhatsAppInboxEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      const unsubscribe = subscribeWhatsAppInbox(organizationId, send);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
