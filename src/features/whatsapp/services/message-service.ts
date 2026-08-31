import type { WhatsAppMessageSenderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publishWhatsAppInboxEvent } from "@/features/whatsapp/lib/event-bus";

export async function recordInboundCustomerMessage(input: {
  sessionId: string;
  organizationId: string;
  waMessageId: string;
  body: string;
  messageType: string;
  rawPayload?: unknown;
}) {
  const existing = await prisma.whatsAppMessage.findUnique({
    where: { waMessageId: input.waMessageId },
    select: { id: true },
  });
  if (existing) return existing;

  const message = await prisma.whatsAppMessage.create({
    data: {
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      waMessageId: input.waMessageId,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      body: input.body,
      messageType: input.messageType,
      rawPayload: input.rawPayload as object | undefined,
    },
  });

  await prisma.whatsAppChatSession.update({
    where: { id: input.sessionId },
    data: { lastMessageAt: new Date() },
  });

  publishWhatsAppInboxEvent({
    type: "message.created",
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    payload: { messageId: message.id, direction: "INBOUND" },
  });

  return message;
}

export async function recordOutboundBotMessage(input: {
  sessionId: string;
  organizationId: string;
  body: string;
  waMessageId?: string | null;
  messageType?: string;
}) {
  const message = await prisma.whatsAppMessage.create({
    data: {
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      waMessageId: input.waMessageId ?? undefined,
      direction: "OUTBOUND",
      senderType: "BOT",
      body: input.body,
      messageType: input.messageType ?? "text",
    },
  });

  publishWhatsAppInboxEvent({
    type: "message.created",
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    payload: { messageId: message.id, direction: "OUTBOUND" },
  });

  return message;
}

export async function recordOutboundAgentMessage(input: {
  sessionId: string;
  organizationId: string;
  body: string;
  sentByUserId: string;
  waMessageId?: string | null;
}) {
  const message = await prisma.whatsAppMessage.create({
    data: {
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      waMessageId: input.waMessageId ?? undefined,
      direction: "OUTBOUND",
      senderType: "AGENT",
      body: input.body,
      messageType: "text",
      sentByUserId: input.sentByUserId,
    },
  });

  await prisma.whatsAppChatSession.update({
    where: { id: input.sessionId },
    data: { lastMessageAt: new Date() },
  });

  publishWhatsAppInboxEvent({
    type: "message.created",
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    payload: { messageId: message.id, direction: "OUTBOUND" },
  });

  return message;
}

export async function listSessionMessages(sessionId: string, organizationId: string) {
  return prisma.whatsAppMessage.findMany({
    where: { sessionId, organizationId },
    orderBy: { createdAt: "asc" },
    include: {
      sentByUser: { select: { name: true } },
    },
  });
}

export function mapMessageRow(
  m: Awaited<ReturnType<typeof listSessionMessages>>[number],
) {
  return {
    id: m.id,
    direction: m.direction,
    senderType: m.senderType as WhatsAppMessageSenderType,
    body: m.body,
    messageType: m.messageType,
    sentByUserName: m.sentByUser?.name ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}
