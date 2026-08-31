import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { hasModule } from "@/features/auth/lib/modules";
import {
  DEFAULT_WHATSAPP_AGENT_SCHEDULE,
  type WhatsAppAgentConfigRow,
  type WhatsAppOrgConfig,
} from "@/features/whatsapp/lib/agent-config";
import {
  getOrganizationWhatsAppConfig,
  getWhatsAppWebhookUrl,
} from "@/features/whatsapp/lib/config";
import { prisma } from "@/lib/prisma";

export type WhatsAppSettingsPayload = {
  org: WhatsAppOrgConfig;
  agents: WhatsAppAgentConfigRow[];
};

async function loadOrganizationRow(organizationId: string) {
  try {
    return await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        waPhoneNumberId: true,
        waDisplayPhone: true,
        waRoutingMode: true,
        waAccessToken: true,
        waVerifyToken: true,
        waGraphApiVersion: true,
      },
    });
  } catch {
    return await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { waPhoneNumberId: true },
    });
  }
}

async function loadAgentMembers(organizationId: string) {
  try {
    return await prisma.organizationMember.findMany({
      where: {
        organizationId,
        role: "AGENT",
        user: {
          isActive: true,
          ...excludePlatformSuperadminFromUser(),
        },
      },
      orderBy: { user: { name: "asc" } },
      select: {
        id: true,
        userId: true,
        allowedModules: true,
        whatsappEnabled: true,
        whatsappPriority: true,
        whatsappWeekdays: true,
        whatsappHourStart: true,
        whatsappHourEnd: true,
        user: { select: { name: true, email: true } },
      },
    });
  } catch {
    return await prisma.organizationMember.findMany({
      where: {
        organizationId,
        role: "AGENT",
        user: {
          isActive: true,
          ...excludePlatformSuperadminFromUser(),
        },
      },
      orderBy: { user: { name: "asc" } },
      select: {
        id: true,
        userId: true,
        allowedModules: true,
        user: { select: { name: true, email: true } },
      },
    });
  }
}

export async function getWhatsAppSettings(
  organizationId: string,
): Promise<WhatsAppSettingsPayload> {
  const [org, members, configured] = await Promise.all([
    loadOrganizationRow(organizationId),
    loadAgentMembers(organizationId),
    getOrganizationWhatsAppConfig(organizationId),
  ]);

  const orgRow = org as {
    waPhoneNumberId?: string | null;
    waDisplayPhone?: string | null;
    waRoutingMode?: WhatsAppOrgConfig["routingMode"];
    waAccessToken?: string | null;
    waVerifyToken?: string | null;
    waGraphApiVersion?: string | null;
  } | null;

  return {
    org: {
      waPhoneNumberId: orgRow?.waPhoneNumberId ?? null,
      waDisplayPhone: orgRow?.waDisplayPhone ?? null,
      routingMode: orgRow?.waRoutingMode ?? "MANUAL",
      configured: configured !== null,
      hasAccessToken: Boolean(orgRow?.waAccessToken?.trim()),
      hasVerifyToken: Boolean(orgRow?.waVerifyToken?.trim()),
      webhookUrl: getWhatsAppWebhookUrl(),
      graphApiVersion: orgRow?.waGraphApiVersion ?? "v21.0",
    },
    agents: members.map((m) => {
      const row = m as typeof m & {
        whatsappEnabled?: boolean;
        whatsappPriority?: number;
        whatsappWeekdays?: number[];
        whatsappHourStart?: number;
        whatsappHourEnd?: number;
      };
      return {
        memberId: row.id,
        userId: row.userId,
        name: row.user.name,
        email: row.user.email,
        enabled:
          row.whatsappEnabled ?? hasModule(row.allowedModules, "whatsapp"),
        priority: row.whatsappPriority ?? 0,
        schedule: {
          weekdays: row.whatsappWeekdays?.length
            ? row.whatsappWeekdays
            : DEFAULT_WHATSAPP_AGENT_SCHEDULE.weekdays,
          hourStart:
            row.whatsappHourStart ?? DEFAULT_WHATSAPP_AGENT_SCHEDULE.hourStart,
          hourEnd:
            row.whatsappHourEnd ?? DEFAULT_WHATSAPP_AGENT_SCHEDULE.hourEnd,
        },
      };
    }),
  };
}
