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
  schedule: WhatsAppAgentSchedule;
  availableNow: boolean;
  openChats: number;
};

export async function listWhatsAppEligibleAgents(
  organizationId: string,
  options?: { onlyAvailableNow?: boolean },
): Promise<EligibleWhatsAppAgent[]> {
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: "AGENT",
      user: {
        isActive: true,
        ...excludePlatformSuperadminFromUser(),
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      allowedModules: true,
      user: { select: { name: true, email: true } },
    },
  });

  const filtered = members.filter((m) => hasModule(m.allowedModules, "whatsapp"));

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
    const schedule = DEFAULT_WHATSAPP_AGENT_SCHEDULE;
    const availableNow = isWithinAgentSchedule(schedule);
    return {
      memberId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      priority: 0,
      schedule,
      availableNow,
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
): Promise<boolean> {
  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      userId,
      role: "AGENT",
      user: { isActive: true, ...excludePlatformSuperadminFromUser() },
    },
    select: { allowedModules: true },
  });
  if (!member) return false;
  return hasModule(member.allowedModules, "whatsapp");
}
