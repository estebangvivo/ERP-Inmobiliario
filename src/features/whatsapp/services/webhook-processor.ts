import { prisma } from "@/lib/prisma";
import type { WhatsAppCredentials } from "@/features/whatsapp/lib/config";
import { resolveOrganizationForPhoneNumberId } from "@/features/whatsapp/lib/config";
import {
  markWhatsAppMessageRead,
  sendWhatsAppText,
} from "@/features/whatsapp/lib/meta-client";
import {
  processBotMessage,
  startBotConversation,
} from "@/features/whatsapp/lib/bot-flow";
import type { InboundWhatsAppMessage } from "@/features/whatsapp/lib/types";
import { publishWhatsAppInboxEvent } from "@/features/whatsapp/lib/event-bus";
import { reopenClosedSessionToBot } from "@/features/whatsapp/services/handoff-service";
import {
  recordInboundCustomerMessage,
  recordOutboundBotMessage,
} from "@/features/whatsapp/services/message-service";
import { getOrCreateChatSession } from "@/features/whatsapp/services/session-service";

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
          interactive?: {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
          button?: { text?: string; payload?: string };
        }>;
        statuses?: unknown[];
      };
    }>;
  }>;
};

function extractInboundMessages(payload: MetaWebhookPayload): InboundWhatsAppMessage[] {
  const result: InboundWhatsAppMessage[] = [];
  if (payload.object !== "whatsapp_business_account") return result;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;
      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const contactName = value.contacts?.[0]?.profile?.name;

      for (const msg of value.messages) {
        let body = "";
        let interactiveId: string | undefined;
        const type = msg.type;

        if (type === "text" && msg.text?.body) {
          body = msg.text.body;
        } else if (type === "interactive") {
          if (msg.interactive?.button_reply) {
            body = msg.interactive.button_reply.title ?? "";
            interactiveId = msg.interactive.button_reply.id;
          } else if (msg.interactive?.list_reply) {
            body = msg.interactive.list_reply.title ?? "";
            interactiveId = msg.interactive.list_reply.id;
          }
        } else if (type === "button" && msg.button) {
          body = msg.button.text ?? msg.button.payload ?? "";
          interactiveId = msg.button.payload;
        } else {
          body = `[${type}]`;
        }

        result.push({
          waMessageId: msg.id,
          fromPhone: msg.from,
          contactName,
          phoneNumberId,
          body,
          messageType: type,
          interactiveId,
          raw: msg,
        });
      }
    }
  }

  return result;
}

function isGreetingOrMenu(body: string): boolean {
  const t = body.trim().toLowerCase();
  if (!t) return false;
  if (t === "menu" || t === "menú") return true;
  return /^(hola|holis|buen[oa]s?(\s+d[ií]as?|\s+tardes?|\s+noches?)?|hey|hi|hello)[\s!.]*$/i.test(
    t,
  );
}

/** Agradecimientos / confirmaciones / despedidas: no reinician el menú. */
function isCourtesyOrFarewell(body: string): boolean {
  const t = body
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!t) return false;
  return /^(muchas?\s+gracias|gracias|mil\s+gracias|ok(ay)?|dale|perfecto|listo|buenisimo|excelente|genial|barbaro|de\s+acuerdo|entendido|chau|adios|hasta\s+luego|nos\s+vemos)([\s!,.]*)$/i.test(
    t,
  );
}

async function sendCourtesyAck(
  sessionId: string,
  organizationId: string,
  phone: string,
  credentials: WhatsAppCredentials,
  waitingForAgent: boolean,
) {
  const body = waitingForAgent
    ? "¡De nada! En breve te atiende un agente."
    : "¡De nada! Si necesitás algo más, escribí *menu*.";
  try {
    const waId = await sendWhatsAppText({
      credentials,
      toPhone: phone,
      body,
    });
    await recordOutboundBotMessage({
      sessionId,
      organizationId,
      body,
      waMessageId: waId,
      messageType: "text",
    });
  } catch (err) {
    console.warn("whatsapp courtesy ack failed", sessionId, err);
  }
}

async function sendLastResortBotHello(
  sessionId: string,
  organizationId: string,
  phone: string,
  credentials: WhatsAppCredentials,
) {
  const body =
    "¡Hola! Soy el asistente de la inmobiliaria. Escribí *menu* para ver las opciones.";
  const waId = await sendWhatsAppText({
    credentials,
    toPhone: phone,
    body,
  });
  await recordOutboundBotMessage({
    sessionId,
    organizationId,
    body,
    waMessageId: waId,
    messageType: "text",
  });
}

async function handleInboundMessage(
  inbound: InboundWhatsAppMessage,
  credentials: WhatsAppCredentials,
  organizationId: string,
) {
  const created = await getOrCreateChatSession({
    organizationId,
    waContactPhone: inbound.fromPhone,
    waContactName: inbound.contactName,
  });

  await recordInboundCustomerMessage({
    sessionId: created.id,
    organizationId,
    waMessageId: inbound.waMessageId,
    body: inbound.body,
    messageType: inbound.messageType,
    rawPayload: inbound.raw,
  });

  await markWhatsAppMessageRead(credentials, inbound.waMessageId);

  // Estado fresco: evita ramas con datos viejos tras handoff/cierre.
  let session = await prisma.whatsAppChatSession.findUniqueOrThrow({
    where: { id: created.id },
  });

  // Con agente humano: el bot no habla hasta Cerrar o Devolver al bot.
  if (session.status === "AGENT_HANDLED" || session.assignedAgentId) {
    publishWhatsAppInboxEvent({
      type: "session.updated",
      organizationId,
      sessionId: session.id,
      payload: { status: session.status },
    });
    return;
  }

  try {
    // Tras derivar (esperando agente): gracias/chau no reinician el menú.
    if (session.status === "WAITING_AGENT") {
      if (isCourtesyOrFarewell(inbound.body)) {
        await sendCourtesyAck(
          session.id,
          organizationId,
          session.waContactPhone,
          credentials,
          true,
        );
        return;
      }
      // Solo hola/menu explícito retoma el asistente (nueva consulta).
      if (isGreetingOrMenu(inbound.body)) {
        try {
          session = await reopenClosedSessionToBot({
            sessionId: session.id,
            organizationId,
          });
        } catch (reopenErr) {
          console.error("whatsapp reopen failed", session.id, reopenErr);
        }
        await startBotConversation(session, credentials);
        return;
      }
      publishWhatsAppInboxEvent({
        type: "session.updated",
        organizationId,
        sessionId: session.id,
        payload: { status: session.status },
      });
      return;
    }

    if (session.status === "BOT_ACTIVE" && isCourtesyOrFarewell(inbound.body)) {
      await sendCourtesyAck(
        session.id,
        organizationId,
        session.waContactPhone,
        credentials,
        false,
      );
      return;
    }

    // Nunca usar solo !botStep: tras handoff/agente botStep es null y reabría el menú.
    const needsFreshBot =
      session.status === "CLOSED" ||
      (session.status === "BOT_ACTIVE" &&
        (!session.botStep || isGreetingOrMenu(inbound.body)));

    if (needsFreshBot) {
      try {
        session = await reopenClosedSessionToBot({
          sessionId: session.id,
          organizationId,
        });
      } catch (reopenErr) {
        console.error("whatsapp reopen failed", session.id, reopenErr);
        // Seguimos igual: intentamos saludar con el estado actual.
      }
      await startBotConversation(session, credentials);
      return;
    }

    if (session.status === "BOT_ACTIVE") {
      await processBotMessage({
        session,
        credentials,
        body: inbound.body,
        interactiveId: inbound.interactiveId,
      });
      return;
    }

    publishWhatsAppInboxEvent({
      type: "session.updated",
      organizationId,
      sessionId: session.id,
      payload: { status: session.status },
    });
  } catch (err) {
    console.error("whatsapp bot handle failed", session.id, err);
    try {
      await sendLastResortBotHello(
        session.id,
        organizationId,
        session.waContactPhone,
        credentials,
      );
      await prisma.whatsAppChatSession.update({
        where: { id: session.id },
        data: {
          status: "BOT_ACTIVE",
          botStep: "AREA_MENU",
          lastMessageAt: new Date(),
          ...(session.assignedAgentId
            ? { assignedAgent: { disconnect: true } }
            : {}),
        },
      });
    } catch (err2) {
      const detail =
        err2 instanceof Error ? err2.message : "Error desconocido al enviar";
      console.error("whatsapp last-resort send failed", session.id, err2);
      // Deja rastro visible en la bandeja para diagnosticar Meta/token.
      try {
        await recordOutboundBotMessage({
          sessionId: session.id,
          organizationId,
          body: `[No se pudo responder por WhatsApp] ${detail}`,
          waMessageId: null,
          messageType: "error",
        });
      } catch {
        /* ignore */
      }
    }
  }
}

export async function processWhatsAppWebhookPayload(
  payload: MetaWebhookPayload,
): Promise<{ processed: number }> {
  const inboundMessages = extractInboundMessages(payload);
  let processed = 0;

  for (const inbound of inboundMessages) {
    const resolved = await resolveOrganizationForPhoneNumberId(
      inbound.phoneNumberId,
    );
    if (!resolved) {
      console.warn(
        "whatsapp webhook: org not resolved for phone_number_id",
        inbound.phoneNumberId,
      );
      continue;
    }

    try {
      await handleInboundMessage(
        inbound,
        resolved.credentials,
        resolved.organizationId,
      );
      processed += 1;
    } catch (err) {
      console.error("whatsapp inbound message", inbound.waMessageId, err);
    }
  }

  return { processed };
}
