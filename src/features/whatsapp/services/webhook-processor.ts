import type { WhatsAppCredentials } from "@/features/whatsapp/lib/config";
import { resolveOrganizationForPhoneNumberId } from "@/features/whatsapp/lib/config";
import {
  markWhatsAppMessageRead,
} from "@/features/whatsapp/lib/meta-client";
import {
  processBotMessage,
} from "@/features/whatsapp/lib/bot-flow";
import type { InboundWhatsAppMessage } from "@/features/whatsapp/lib/types";
import { publishWhatsAppInboxEvent } from "@/features/whatsapp/lib/event-bus";
import { recordInboundCustomerMessage } from "@/features/whatsapp/services/message-service";
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

async function handleInboundMessage(
  inbound: InboundWhatsAppMessage,
  credentials: WhatsAppCredentials,
  organizationId: string,
) {
  const session = await getOrCreateChatSession({
    organizationId,
    waContactPhone: inbound.fromPhone,
    waContactName: inbound.contactName,
  });

  await recordInboundCustomerMessage({
    sessionId: session.id,
    organizationId,
    waMessageId: inbound.waMessageId,
    body: inbound.body,
    messageType: inbound.messageType,
    rawPayload: inbound.raw,
  });

  await markWhatsAppMessageRead(credentials, inbound.waMessageId);

  if (session.status === "BOT_ACTIVE") {
    await processBotMessage({
      session,
      credentials,
      body: inbound.body,
      interactiveId: inbound.interactiveId,
    });
    return;
  }

  if (
    session.status === "WAITING_AGENT" &&
    inbound.body.toLowerCase().includes("menu")
  ) {
    // No reactivar bot automáticamente; solo notificar agentes.
    publishWhatsAppInboxEvent({
      type: "session.updated",
      organizationId,
      sessionId: session.id,
    });
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
