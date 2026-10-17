import type { WhatsAppAgentArea } from "@prisma/client";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { hasModule } from "@/features/auth/lib/modules";
import {
  DEFAULT_WHATSAPP_AGENT_SCHEDULE,
  isWithinAgentSchedule,
  type WhatsAppAgentSchedule,
} from "@/features/whatsapp/lib/agent-config";
import { prisma } from "@/lib/prisma";

export type EligibleWhatsAppAgent = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  priority: number;
  areas: WhatsAppAgentArea[];
  schedule: WhatsAppAgentSchedule;
  availableNow: boolean;
  openChats: number;
};

export async function listWhatsAppEligibleAgents(
  organizationId: string,
  options?: {
    onlyAvailableNow?: boolean;
    area?: WhatsAppAgentArea | null;
  },
): Promise<EligibleWhatsAppAgent[]> {
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: "AGENT",
      whatsappEnabled: true,
      user: {
        isActive: true,
        ...excludePlatformSuperadminFromUser(),
      },
    },
    orderBy: [{ whatsappPriority: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      userId: true,
      allowedModules: true,
      whatsappEnabled: true,
      whatsappPriority: true,
      whatsappWeekdays: true,
      whatsappHourStart: true,
      whatsappHourEnd: true,
      whatsappAreas: true,
      user: { select: { name: true, email: true } },
    },
  });

  const filtered = members.filter(
    (m) =>
      m.whatsappEnabled &&
      hasModule(m.allowedModules, "whatsapp") &&
      (!options?.area ||
        m.whatsappAreas.length === 0 ||
        m.whatsappAreas.includes(options.area)),
  );

  const userIds = filtered.map((m) => m.userId);
  const openCounts =
    userIds.length === 0
      ? []
      : await prisma.whatsAppChatSession.groupBy({
          by: ["assignedAgentId"],
          where: {
            organizationId,
            assignedAgentId: { in: userIds },
            status: "AGENT_HANDLED",
          },
          _count: { _all: true },
        });

  const countByUser = new Map(
    openCounts.map((row) => [row.assignedAgentId!, row._count._all]),
  );

  const agents = filtered.map((m) => {
    const schedule: WhatsAppAgentSchedule = {
      weekdays: m.whatsappWeekdays?.length
        ? m.whatsappWeekdays
        : DEFAULT_WHATSAPP_AGENT_SCHEDULE.weekdays,
      hourStart:
        m.whatsappHourStart ?? DEFAULT_WHATSAPP_AGENT_SCHEDULE.hourStart,
      hourEnd: m.whatsappHourEnd ?? DEFAULT_WHATSAPP_AGENT_SCHEDULE.hourEnd,
    };
    return {
      memberId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      priority: m.whatsappPriority ?? 0,
      areas: m.whatsappAreas ?? [],
      schedule,
      availableNow: isWithinAgentSchedule(schedule),
      openChats: countByUser.get(m.userId) ?? 0,
    };
  });

  if (options?.onlyAvailableNow) {
    return agents.filter((a) => a.availableNow);
  }
  return agents;
}

export async function isUserWhatsAppEligible(
  organizationId: string,
  userId: string,
  options?: {
    area?: WhatsAppAgentArea | null;
    /** Si true, no exige estar dentro del horario (p. ej. Tomar control manual). */
    ignoreSchedule?: boolean;
  },
): Promise<boolean> {
  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      userId,
      role: "AGENT",
      whatsappEnabled: true,
      user: { isActive: true, ...excludePlatformSuperadminFromUser() },
    },
    select: {
      allowedModules: true,
      whatsappAreas: true,
      whatsappWeekdays: true,
      whatsappHourStart: true,
      whatsappHourEnd: true,
    },
  });
  if (!member) return false;
  if (!hasModule(member.allowedModules, "whatsapp")) return false;
  const area = options?.area;
  if (
    area &&
    member.whatsappAreas.length > 0 &&
    !member.whatsappAreas.includes(area)
  ) {
    return false;
  }
  if (options?.ignoreSchedule) return true;
  const schedule: WhatsAppAgentSchedule = {
    weekdays: member.whatsappWeekdays?.length
      ? member.whatsappWeekdays
      : DEFAULT_WHATSAPP_AGENT_SCHEDULE.weekdays,
    hourStart:
      member.whatsappHourStart ?? DEFAULT_WHATSAPP_AGENT_SCHEDULE.hourStart,
    hourEnd: member.whatsappHourEnd ?? DEFAULT_WHATSAPP_AGENT_SCHEDULE.hourEnd,
  };
  return isWithinAgentSchedule(schedule);
}
