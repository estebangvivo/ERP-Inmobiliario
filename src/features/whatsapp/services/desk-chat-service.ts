import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { publishWhatsAppInboxEvent } from "@/features/whatsapp/lib/event-bus";
import { prisma } from "@/lib/prisma";

export async function listOrgAgentsForDesk(organizationId: string) {
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: { in: ["AGENT", "ADMIN"] },
      user: {
        isActive: true,
        ...excludePlatformSuperadminFromUser(),
      },
    },
    orderBy: { user: { name: "asc" } },
    select: {
      userId: true,
      role: true,
      whatsappAreas: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    areas: m.whatsappAreas,
  }));
}

export async function listDeskThreadsForUser(
  organizationId: string,
  userId: string,
) {
  const threads = await prisma.agentDeskThread.findMany({
    where: {
      organizationId,
      participants: { some: { userId } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: {
      participants: {
        include: { user: { select: { id: true, name: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, senderId: true },
      },
      relatedWhatsAppSession: {
        select: {
          id: true,
          waContactName: true,
          waContactPhone: true,
          requestedArea: true,
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return threads.map((t) => {
    const me = t.participants.find((p) => p.userId === userId);
    const last = t.messages[0];
    const readAt = me?.lastReadAt ?? me?.joinedAt ?? null;
    const unread =
      Boolean(last) &&
      last!.senderId !== userId &&
      (!readAt || last!.createdAt > readAt);

    return {
      id: t.id,
      title: t.title,
      lastMessageAt: t.lastMessageAt.toISOString(),
      lastMessagePreview: last?.body ?? null,
      unread,
      participants: t.participants.map((p) => ({
        userId: p.user.id,
        name: p.user.name,
      })),
      relatedWhatsAppSession: t.relatedWhatsAppSession
        ? {
            id: t.relatedWhatsAppSession.id,
            name:
              t.relatedWhatsAppSession.waContactName ??
              t.relatedWhatsAppSession.waContactPhone,
            area: t.relatedWhatsAppSession.requestedArea,
          }
        : null,
      createdByName: t.createdBy?.name ?? null,
    };
  });
}

export async function countUnreadDeskThreads(
  organizationId: string,
  userId: string,
) {
  const snapshot = await getDeskInboxSnapshot(organizationId, userId);
  return snapshot.unreadCount;
}

/** Snapshot para badge + toast (polling cuando el SSE no llega). */
export async function getDeskInboxSnapshot(
  organizationId: string,
  userId: string,
) {
  const threads = await prisma.agentDeskThread.findMany({
    where: {
      organizationId,
      participants: { some: { userId } },
    },
    select: {
      id: true,
      title: true,
      participants: {
        where: { userId },
        select: { lastReadAt: true, joinedAt: true },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          body: true,
          senderId: true,
          createdAt: true,
          sender: { select: { name: true } },
        },
      },
    },
  });

  const unreadThreads = threads.filter((t) => {
    const me = t.participants[0];
    const last = t.messages[0];
    if (!me || !last || last.senderId === userId) return false;
    const readAt = me.lastReadAt ?? me.joinedAt;
    return last.createdAt > readAt;
  });

  const latest = unreadThreads
    .map((t) => ({
      threadId: t.id,
      title: t.title,
      messageId: t.messages[0]!.id,
      preview: t.messages[0]!.body.slice(0, 160),
      senderName: t.messages[0]!.sender.name,
      createdAt: t.messages[0]!.createdAt.toISOString(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return {
    unreadCount: unreadThreads.length,
    latest: latest
      ? {
          ...latest,
          href: `/whatsapp/equipo?thread=${latest.threadId}`,
        }
      : null,
  };
}

export async function getDeskThread(
  threadId: string,
  organizationId: string,
  userId: string,
) {
  const thread = await prisma.agentDeskThread.findFirst({
    where: {
      id: threadId,
      organizationId,
      participants: { some: { userId } },
    },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      relatedWhatsAppSession: {
        select: {
          id: true,
          waContactName: true,
          waContactPhone: true,
          requestedArea: true,
          status: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true } } },
      },
    },
  });
  if (!thread) return null;

  return {
    id: thread.id,
    title: thread.title,
    participants: thread.participants.map((p) => ({
      userId: p.user.id,
      name: p.user.name,
      email: p.user.email,
    })),
    relatedWhatsAppSession: thread.relatedWhatsAppSession
      ? {
          id: thread.relatedWhatsAppSession.id,
          name:
            thread.relatedWhatsAppSession.waContactName ??
            thread.relatedWhatsAppSession.waContactPhone,
          phone: thread.relatedWhatsAppSession.waContactPhone,
          area: thread.relatedWhatsAppSession.requestedArea,
          status: thread.relatedWhatsAppSession.status,
        }
      : null,
    messages: thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.senderId,
      senderName: m.sender.name,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function markDeskThreadRead(input: {
  threadId: string;
  organizationId: string;
  userId: string;
}) {
  await prisma.agentDeskParticipant.updateMany({
    where: {
      threadId: input.threadId,
      userId: input.userId,
      thread: { organizationId: input.organizationId },
    },
    data: { lastReadAt: new Date() },
  });
}

async function publishDeskMessageEvent(input: {
  organizationId: string;
  threadId: string;
  messageId: string;
  senderId: string;
  body: string;
  title: string | null;
}) {
  const [participants, sender] = await Promise.all([
    prisma.agentDeskParticipant.findMany({
      where: { threadId: input.threadId },
      select: { userId: true },
    }),
    prisma.user.findUnique({
      where: { id: input.senderId },
      select: { name: true },
    }),
  ]);

  const notifyUserIds = participants
    .map((p) => p.userId)
    .filter((id) => id !== input.senderId);

  publishWhatsAppInboxEvent({
    type: "desk.message.created",
    organizationId: input.organizationId,
    threadId: input.threadId,
    payload: {
      messageId: input.messageId,
      senderId: input.senderId,
      senderName: sender?.name ?? "Compañero",
      preview: input.body.slice(0, 160),
      title: input.title,
      notifyUserIds,
      href: `/whatsapp/equipo?thread=${input.threadId}`,
    },
  });
}

export async function createDeskThread(input: {
  organizationId: string;
  createdById: string;
  participantUserIds: string[];
  title?: string;
  relatedWhatsAppSessionId?: string;
  initialMessage?: string;
}) {
  const uniqueParticipants = [
    ...new Set([input.createdById, ...input.participantUserIds]),
  ];
  if (uniqueParticipants.length < 2) {
    throw new Error("NEED_PARTICIPANTS");
  }

  if (input.relatedWhatsAppSessionId) {
    const session = await prisma.whatsAppChatSession.findFirst({
      where: {
        id: input.relatedWhatsAppSessionId,
        organizationId: input.organizationId,
      },
      select: { id: true, waContactName: true, waContactPhone: true },
    });
    if (!session) throw new Error("SESSION_NOT_FOUND");
  }

  const now = new Date();
  const initial = input.initialMessage?.trim() || null;

  const thread = await prisma.agentDeskThread.create({
    data: {
      organizationId: input.organizationId,
      createdById: input.createdById,
      title: input.title?.trim() || null,
      relatedWhatsAppSessionId: input.relatedWhatsAppSessionId ?? null,
      participants: {
        create: uniqueParticipants.map((userId) => ({
          userId,
          lastReadAt: userId === input.createdById ? now : null,
        })),
      },
      ...(initial
        ? {
            messages: {
              create: {
                senderId: input.createdById,
                body: initial,
              },
            },
          }
        : {}),
    },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  publishWhatsAppInboxEvent({
    type: "desk.thread.updated",
    organizationId: input.organizationId,
    threadId: thread.id,
    payload: {
      notifyUserIds: uniqueParticipants.filter((id) => id !== input.createdById),
      href: `/whatsapp/equipo?thread=${thread.id}`,
    },
  });

  if (initial && thread.messages[0]) {
    await publishDeskMessageEvent({
      organizationId: input.organizationId,
      threadId: thread.id,
      messageId: thread.messages[0].id,
      senderId: input.createdById,
      body: initial,
      title: thread.title,
    });
  }

  return thread;
}

export async function sendDeskMessage(input: {
  threadId: string;
  organizationId: string;
  senderId: string;
  body: string;
}) {
  const text = input.body.trim();
  if (!text) throw new Error("EMPTY_MESSAGE");

  const thread = await prisma.agentDeskThread.findFirst({
    where: {
      id: input.threadId,
      organizationId: input.organizationId,
      participants: { some: { userId: input.senderId } },
    },
    select: { id: true, title: true },
  });
  if (!thread) throw new Error("THREAD_NOT_FOUND");

  const message = await prisma.agentDeskMessage.create({
    data: {
      threadId: input.threadId,
      senderId: input.senderId,
      body: text,
    },
  });

  await prisma.$transaction([
    prisma.agentDeskThread.update({
      where: { id: input.threadId },
      data: { lastMessageAt: new Date() },
    }),
    prisma.agentDeskParticipant.updateMany({
      where: { threadId: input.threadId, userId: input.senderId },
      data: { lastReadAt: new Date() },
    }),
  ]);

  await publishDeskMessageEvent({
    organizationId: input.organizationId,
    threadId: input.threadId,
    messageId: message.id,
    senderId: input.senderId,
    body: text,
    title: thread.title,
  });

  return message;
}
