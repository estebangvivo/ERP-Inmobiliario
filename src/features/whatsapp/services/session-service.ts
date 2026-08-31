import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsAppPhone } from "@/features/auth/lib/phone";
import { publishWhatsAppInboxEvent } from "@/features/whatsapp/lib/event-bus";

export async function getOrCreateChatSession(input: {
  organizationId: string;
  waContactPhone: string;
  waContactName?: string | null;
}) {
  const phone = normalizeWhatsAppPhone(input.waContactPhone) || input.waContactPhone;

  const existing = await prisma.whatsAppChatSession.findUnique({
    where: {
      organizationId_waContactPhone: {
        organizationId: input.organizationId,
        waContactPhone: phone,
      },
    },
  });

  if (existing) {
    if (input.waContactName && input.waContactName !== existing.waContactName) {
      return prisma.whatsAppChatSession.update({
        where: { id: existing.id },
        data: { waContactName: input.waContactName },
      });
    }
    return existing;
  }

  return prisma.whatsAppChatSession.create({
    data: {
      organizationId: input.organizationId,
      waContactPhone: phone,
      waContactName: input.waContactName ?? null,
      status: "BOT_ACTIVE",
      botStep: "MAIN_MENU",
    },
  });
}

export async function touchSessionLastMessage(sessionId: string) {
  return prisma.whatsAppChatSession.update({
    where: { id: sessionId },
    data: { lastMessageAt: new Date() },
  });
}

export async function listInboxSessions(
  organizationId: string,
  options?: { status?: string; limit?: number },
) {
  const sessions = await prisma.whatsAppChatSession.findMany({
    where: {
      organizationId,
      ...(options?.status ? { status: options.status as never } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: options?.limit ?? 50,
    include: {
      assignedAgent: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true },
      },
      _count: {
        select: {
          messages: {
            where: { direction: "INBOUND", senderType: "CUSTOMER" },
          },
        },
      },
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    waContactPhone: s.waContactPhone,
    waContactName: s.waContactName,
    status: s.status,
    botStep: s.botStep,
    botPayload: s.botPayload,
    assignedAgentId: s.assignedAgentId,
    assignedAgentName: s.assignedAgent?.name ?? null,
    leadId: s.leadId,
    lastMessageAt: s.lastMessageAt.toISOString(),
    lastMessagePreview: s.messages[0]?.body ?? null,
    unreadCount: s._count.messages,
  }));
}

export async function getSessionForOrg(sessionId: string, organizationId: string) {
  return prisma.whatsAppChatSession.findFirst({
    where: { id: sessionId, organizationId },
    include: {
      assignedAgent: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, status: true } },
    },
  });
}

export async function updateSessionStatus(
  sessionId: string,
  organizationId: string,
  data: Prisma.WhatsAppChatSessionUpdateInput,
) {
  const updated = await prisma.whatsAppChatSession.update({
    where: { id: sessionId },
    data: { ...data, lastMessageAt: new Date() },
  });

  if (updated.organizationId !== organizationId) {
    throw new Error("SESSION_FORBIDDEN");
  }

  publishWhatsAppInboxEvent({
    type: "session.updated",
    organizationId,
    sessionId,
    payload: { status: updated.status },
  });

  return updated;
}
