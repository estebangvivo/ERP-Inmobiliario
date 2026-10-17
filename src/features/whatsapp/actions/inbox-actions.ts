"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  assignAgentToChatSession,
  closeChatSession,
  releaseChatSessionToBot,
  sendAgentWhatsAppMessage,
} from "@/features/whatsapp/services/handoff-service";
import {
  listSessionMessages,
  mapMessageRow,
} from "@/features/whatsapp/services/message-service";
import {
  getSessionForOrg,
  listInboxSessions,
} from "@/features/whatsapp/services/session-service";
import { parseBotPayload } from "@/features/whatsapp/lib/lead-sync";
import { listWhatsAppEligibleAgents } from "@/features/whatsapp/services/agent-eligibility";
import { requireModule, requireStaff } from "@/lib/session";
import type { ActionResult } from "@/server/actions/users";

export type WhatsAppActionResult = ActionResult & { message?: string };

export async function listWhatsAppSessionsAction(filters?: {
  status?: string;
  area?: string;
}) {
  const session = await requireModule("whatsapp");
  await requireStaff();
  const items = await listInboxSessions(session.organizationId, {
    status: filters?.status || undefined,
    area: filters?.area || undefined,
    limit: 100,
  });
  return items.map((item) => ({
    ...item,
    botPayload: parseBotPayload(item.botPayload as never),
  }));
}

export async function getWhatsAppThreadAction(sessionId: string) {
  const session = await requireModule("whatsapp");
  await requireStaff();
  const chat = await getSessionForOrg(sessionId, session.organizationId);
  if (!chat) return null;
  const messages = await listSessionMessages(sessionId, session.organizationId);
  return {
    session: {
      id: chat.id,
      waContactPhone: chat.waContactPhone,
      waContactName: chat.waContactName,
      status: chat.status,
      botPayload: parseBotPayload(chat.botPayload),
      requestedArea: chat.requestedArea,
      assignedAgentId: chat.assignedAgentId,
      assignedAgentName: chat.assignedAgent?.name ?? null,
      leadId: chat.leadId,
      leadName: chat.lead?.name ?? null,
      leadStatus: chat.lead?.status ?? null,
    },
    messages: messages.map(mapMessageRow),
  };
}

const sendSchema = z.object({
  sessionId: z.string().min(1),
  body: z.string().min(1).max(4096),
});

export async function sendWhatsAppReplyAction(
  _prev: WhatsAppActionResult | null,
  formData: FormData,
): Promise<WhatsAppActionResult> {
  try {
    const session = await requireModule("whatsapp");
    await requireStaff();
    const parsed = sendSchema.safeParse({
      sessionId: formData.get("sessionId"),
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return { ok: false, error: "Mensaje inválido." };
    }

    await sendAgentWhatsAppMessage({
      sessionId: parsed.data.sessionId,
      organizationId: session.organizationId,
      agentUserId: session.user.id,
      body: parsed.data.body,
    });

    revalidatePath("/whatsapp");
    return { ok: true, message: "Mensaje enviado." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar.";
    if (msg === "WHATSAPP_NOT_CONFIGURED") {
      return {
        ok: false,
        error: "WhatsApp no está configurado (META_WA_TOKEN / PHONE_NUMBER_ID).",
      };
    }
    if (msg === "BOT_STILL_ACTIVE") {
      return {
        ok: false,
        error: "Tomá el control del chat antes de responder manualmente.",
      };
    }
    return { ok: false, error: "No se pudo enviar el mensaje." };
  }
}

export async function assignWhatsAppAgentAction(
  sessionId: string,
  agentUserId?: string,
): Promise<WhatsAppActionResult> {
  try {
    const session = await requireModule("whatsapp");
    await requireStaff();
    await assignAgentToChatSession({
      sessionId,
      organizationId: session.organizationId,
      agentUserId: agentUserId ?? session.user.id,
      notifyCustomer: true,
    });
    return { ok: true, message: "Chat tomado. El bot quedó deshabilitado." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "AGENT_NOT_ELIGIBLE") {
      return {
        ok: false,
        error: "Ese usuario no está habilitado para atender WhatsApp.",
      };
    }
    return { ok: false, error: "No se pudo asignar el chat." };
  }
}

export async function releaseWhatsAppSessionAction(
  sessionId: string,
): Promise<WhatsAppActionResult> {
  try {
    const session = await requireModule("whatsapp");
    await requireStaff();
    await releaseChatSessionToBot({
      sessionId,
      organizationId: session.organizationId,
    });
    return { ok: true, message: "Conversación devuelta al bot." };
  } catch {
    return { ok: false, error: "No se pudo devolver al bot." };
  }
}

export async function closeWhatsAppSessionAction(
  sessionId: string,
): Promise<WhatsAppActionResult> {
  try {
    const session = await requireModule("whatsapp");
    await requireStaff();
    await closeChatSession({
      sessionId,
      organizationId: session.organizationId,
    });
    return { ok: true, message: "Conversación cerrada." };
  } catch {
    return { ok: false, error: "No se pudo cerrar la conversación." };
  }
}

export async function listEligibleAgentsForSessionAction(sessionId: string) {
  const session = await requireModule("whatsapp");
  await requireStaff();
  const chat = await getSessionForOrg(sessionId, session.organizationId);
  return listWhatsAppEligibleAgents(session.organizationId, {
    area: chat?.requestedArea ?? undefined,
  });
}
