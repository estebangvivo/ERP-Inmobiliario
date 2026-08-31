import { revalidatePath } from "next/cache";
import type { WhatsAppCredentials } from "@/features/whatsapp/lib/config";
import { getOrganizationWhatsAppConfig } from "@/features/whatsapp/lib/config";
import { sendWhatsAppText } from "@/features/whatsapp/lib/meta-client";
import { publishWhatsAppInboxEvent } from "@/features/whatsapp/lib/event-bus";
import { isUserWhatsAppEligible } from "@/features/whatsapp/services/agent-eligibility";
import { recordOutboundAgentMessage } from "@/features/whatsapp/services/message-service";
import { updateSessionStatus } from "@/features/whatsapp/services/session-service";
import { prisma } from "@/lib/prisma";

export async function assignAgentToChatSession(input: {
  sessionId: string;
  organizationId: string;
  agentUserId: string;
  notifyCustomer?: boolean;
}) {
  const session = await prisma.whatsAppChatSession.findFirst({
    where: { id: input.sessionId, organizationId: input.organizationId },
    include: { assignedAgent: { select: { name: true } } },
  });
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const eligible = await isUserWhatsAppEligible(
    input.organizationId,
    input.agentUserId,
  );
  const isAdmin = await prisma.organizationMember.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: input.agentUserId,
      role: "ADMIN",
      user: { isActive: true },
    },
    select: { id: true },
  });
  if (!eligible && !isAdmin) {
    throw new Error("AGENT_NOT_ELIGIBLE");
  }

  const updated = await updateSessionStatus(input.sessionId, input.organizationId, {
    status: "AGENT_HANDLED",
    assignedAgentId: input.agentUserId,
    botStep: null,
  });

  if (session.leadId) {
    await prisma.lead.update({
      where: { id: session.leadId },
      data: { assigneeId: input.agentUserId, status: "CONTACTED" },
    });
  }

  const credentials = await getOrganizationWhatsAppConfig(input.organizationId);
  if (input.notifyCustomer && credentials) {
    const agent = await prisma.user.findUnique({
      where: { id: input.agentUserId },
      select: { name: true },
    });
    const waId = await sendWhatsAppText({
      credentials,
      toPhone: session.waContactPhone,
      body: `Te atiende ${agent?.name ?? "un asesor"} de la inmobiliaria. ¿En qué podemos ayudarte?`,
    });
    await recordOutboundAgentMessage({
      sessionId: session.id,
      organizationId: session.organizationId,
      body: `Te atiende ${agent?.name ?? "un asesor"} de la inmobiliaria.`,
      sentByUserId: input.agentUserId,
      waMessageId: waId,
    });
  }

  publishWhatsAppInboxEvent({
    type: "session.updated",
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    payload: { status: "AGENT_HANDLED", agentUserId: input.agentUserId },
  });

  revalidatePath("/whatsapp");
  revalidatePath("/leads");
  return updated;
}

export async function closeChatSession(input: {
  sessionId: string;
  organizationId: string;
}) {
  const updated = await updateSessionStatus(input.sessionId, input.organizationId, {
    status: "CLOSED",
    botStep: null,
  });
  revalidatePath("/whatsapp");
  return updated;
}

export async function sendAgentWhatsAppMessage(input: {
  sessionId: string;
  organizationId: string;
  agentUserId: string;
  body: string;
  credentials?: WhatsAppCredentials | null;
}) {
  const text = input.body.trim();
  if (!text) throw new Error("EMPTY_MESSAGE");

  const session = await prisma.whatsAppChatSession.findFirst({
    where: { id: input.sessionId, organizationId: input.organizationId },
  });
  if (!session) throw new Error("SESSION_NOT_FOUND");

  if (session.status === "BOT_ACTIVE") {
    throw new Error("BOT_STILL_ACTIVE");
  }

  const credentials =
    input.credentials ??
    (await getOrganizationWhatsAppConfig(input.organizationId));
  if (!credentials) throw new Error("WHATSAPP_NOT_CONFIGURED");

  const waId = await sendWhatsAppText({
    credentials,
    toPhone: session.waContactPhone,
    body: text,
  });

  const message = await recordOutboundAgentMessage({
    sessionId: session.id,
    organizationId: session.organizationId,
    body: text,
    sentByUserId: input.agentUserId,
    waMessageId: waId,
  });

  if (session.status === "WAITING_AGENT") {
    await updateSessionStatus(session.id, session.organizationId, {
      status: "AGENT_HANDLED",
      assignedAgentId: input.agentUserId,
    });
  }

  revalidatePath("/whatsapp");
  return message;
}
