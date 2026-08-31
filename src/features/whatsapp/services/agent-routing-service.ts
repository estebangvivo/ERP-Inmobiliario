import type { WhatsAppRoutingMode } from "@prisma/client";
import { assignAgentToChatSession } from "@/features/whatsapp/services/handoff-service";
import {
  listWhatsAppEligibleAgents,
  type EligibleWhatsAppAgent,
} from "@/features/whatsapp/services/agent-eligibility";
import { prisma } from "@/lib/prisma";

export type { EligibleWhatsAppAgent } from "@/features/whatsapp/services/agent-eligibility";
export {
  listWhatsAppEligibleAgents,
  isUserWhatsAppEligible,
} from "@/features/whatsapp/services/agent-eligibility";

async function pickRoundRobinAgent(
  organizationId: string,
  agents: EligibleWhatsAppAgent[],
): Promise<EligibleWhatsAppAgent | null> {
  if (agents.length === 0) return null;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { waLastRoutedAgentId: true },
  });

  const sorted = [...agents].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.name.localeCompare(b.name, "es");
  });

  const lastId = org?.waLastRoutedAgentId;
  if (!lastId) return sorted[0] ?? null;

  const lastIndex = sorted.findIndex((a) => a.userId === lastId);
  if (lastIndex === -1) return sorted[0] ?? null;
  return sorted[(lastIndex + 1) % sorted.length] ?? null;
}

function pickLeastBusyAgent(
  agents: EligibleWhatsAppAgent[],
): EligibleWhatsAppAgent | null {
  if (agents.length === 0) return null;
  const sorted = [...agents].sort((a, b) => {
    if (a.openChats !== b.openChats) return a.openChats - b.openChats;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.name.localeCompare(b.name, "es");
  });
  return sorted[0] ?? null;
}

export async function pickAgentForRouting(
  organizationId: string,
  routingMode: WhatsAppRoutingMode,
): Promise<EligibleWhatsAppAgent | null> {
  const available = await listWhatsAppEligibleAgents(organizationId, {
    onlyAvailableNow: true,
  });
  if (available.length === 0) return null;

  switch (routingMode) {
    case "ROUND_ROBIN":
      return pickRoundRobinAgent(organizationId, available);
    case "LEAST_BUSY":
      return pickLeastBusyAgent(available);
    default:
      return null;
  }
}

export async function autoRouteChatSession(input: {
  sessionId: string;
  organizationId: string;
  routingMode: WhatsAppRoutingMode;
}): Promise<{ assigned: boolean; agentUserId?: string }> {
  if (input.routingMode === "MANUAL") {
    return { assigned: false };
  }

  const agent = await pickAgentForRouting(
    input.organizationId,
    input.routingMode,
  );
  if (!agent) return { assigned: false };

  await assignAgentToChatSession({
    sessionId: input.sessionId,
    organizationId: input.organizationId,
    agentUserId: agent.userId,
    notifyCustomer: true,
  });

  await prisma.organization.update({
    where: { id: input.organizationId },
    data: { waLastRoutedAgentId: agent.userId },
  });

  return { assigned: true, agentUserId: agent.userId };
}
