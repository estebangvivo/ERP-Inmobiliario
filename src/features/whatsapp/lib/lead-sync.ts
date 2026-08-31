import type { OrganizationRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { hasModule } from "@/features/auth/lib/modules";
import { prisma } from "@/lib/prisma";
import type { BotPayload, WhatsAppIntent } from "@/features/whatsapp/lib/types";
import { WHATSAPP_INTENT_LABELS } from "@/features/whatsapp/lib/types";

function intentLabel(intent?: WhatsAppIntent): string {
  if (!intent) return "Consulta";
  return WHATSAPP_INTENT_LABELS[intent];
}

function buildLeadMessage(payload: BotPayload, contactName?: string | null): string {
  const lines = [
    `Consulta vía WhatsApp${contactName ? ` (${contactName})` : ""}.`,
    `Intención: ${intentLabel(payload.intent)}`,
  ];
  if (payload.zone) lines.push(`Zona: ${payload.zone}`);
  if (payload.budget) lines.push(`Presupuesto: ${payload.budget}`);
  if (payload.propertyType) lines.push(`Tipo de inmueble: ${payload.propertyType}`);
  return lines.join("\n");
}

function placeholderEmail(phone: string): string {
  return `wa+${phone}@inbox.local`;
}

export async function upsertLeadFromWhatsAppBot(input: {
  organizationId: string;
  phone: string;
  contactName?: string | null;
  payload: BotPayload;
  existingLeadId?: string | null;
}): Promise<string> {
  const message = buildLeadMessage(input.payload, input.contactName);
  const name = input.contactName?.trim() || `WhatsApp ${input.phone}`;
  const email = placeholderEmail(input.phone);

  if (input.existingLeadId) {
    await prisma.lead.update({
      where: { id: input.existingLeadId },
      data: {
        message,
        phone: input.phone,
        name,
        status: "NEW",
        source: "whatsapp",
      },
    });
    return input.existingLeadId;
  }

  const candidates = await prisma.organizationMember.findMany({
    where: {
      organizationId: input.organizationId,
      role: "AGENT",
      user: {
        isActive: true,
        ...excludePlatformSuperadminFromUser(),
      },
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true, allowedModules: true },
  });
  const fallbackAgent =
    candidates.find((m) => hasModule(m.allowedModules, "whatsapp")) ?? null;

  const lead = await prisma.lead.create({
    data: {
      organizationId: input.organizationId,
      name,
      email,
      phone: input.phone,
      message,
      status: "NEW",
      source: "whatsapp",
      assigneeId: fallbackAgent?.userId ?? null,
    },
  });

  return lead.id;
}

export function parseBotPayload(value: Prisma.JsonValue | null): BotPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const o = value as Record<string, unknown>;
  const orgRoles: OrganizationRole[] = [
    "ADMIN",
    "AGENT",
    "OWNER",
    "TENANT",
    "GUARANTOR",
    "SUPPLIER",
    "VIEWER",
  ];
  return {
    intent:
      o.intent === "BUY" ||
      o.intent === "RENT" ||
      o.intent === "APPRAISE" ||
      o.intent === "AGENT"
        ? o.intent
        : undefined,
    zone: typeof o.zone === "string" ? o.zone : undefined,
    budget: typeof o.budget === "string" ? o.budget : undefined,
    propertyType:
      typeof o.propertyType === "string" ? o.propertyType : undefined,
    userId: typeof o.userId === "string" ? o.userId : undefined,
    contactFirstName:
      typeof o.contactFirstName === "string" ? o.contactFirstName : undefined,
    orgRole: orgRoles.includes(o.orgRole as OrganizationRole)
      ? (o.orgRole as OrganizationRole)
      : undefined,
    isClient: o.isClient === true,
  };
}
