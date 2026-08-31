import { prisma } from "@/lib/prisma";

export type WhatsAppCredentials = {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  graphApiVersion: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getWhatsAppWebhookUrl(): string {
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${origin}/api/whatsapp/webhook`;
}

/** Credenciales globales desde variables de entorno (fallback). */
export function getEnvWhatsAppConfig(): WhatsAppCredentials | null {
  const accessToken = readEnv("META_WA_TOKEN");
  const phoneNumberId = readEnv("PHONE_NUMBER_ID");
  const verifyToken = readEnv("VERIFY_TOKEN");
  if (!accessToken || !phoneNumberId || !verifyToken) return null;
  return {
    accessToken,
    phoneNumberId,
    verifyToken,
    graphApiVersion: readEnv("META_GRAPH_API_VERSION") ?? "v21.0",
  };
}

/** @deprecated Usar getOrganizationWhatsAppConfig */
export function getGlobalWhatsAppConfig(): WhatsAppCredentials | null {
  return getEnvWhatsAppConfig();
}

type OrgWhatsAppRow = {
  waAccessToken: string | null;
  waPhoneNumberId: string | null;
  waVerifyToken: string | null;
  waGraphApiVersion: string | null;
};

function mergeCredentials(org: OrgWhatsAppRow): WhatsAppCredentials | null {
  const env = getEnvWhatsAppConfig();
  const accessToken = org.waAccessToken?.trim() || env?.accessToken;
  const phoneNumberId = org.waPhoneNumberId?.trim() || env?.phoneNumberId;
  const verifyToken = org.waVerifyToken?.trim() || env?.verifyToken;
  if (!accessToken || !phoneNumberId || !verifyToken) return null;
  return {
    accessToken,
    phoneNumberId,
    verifyToken,
    graphApiVersion:
      org.waGraphApiVersion?.trim() ||
      env?.graphApiVersion ||
      readEnv("META_GRAPH_API_VERSION") ||
      "v21.0",
  };
}

export async function getOrganizationWhatsAppConfig(
  organizationId: string,
): Promise<WhatsAppCredentials | null> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        waAccessToken: true,
        waPhoneNumberId: true,
        waVerifyToken: true,
        waGraphApiVersion: true,
      },
    });
    if (!org) return getEnvWhatsAppConfig();
    return mergeCredentials(org);
  } catch {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { waPhoneNumberId: true },
    });
    const env = getEnvWhatsAppConfig();
    if (!env) return null;
    if (org?.waPhoneNumberId && env.phoneNumberId !== org.waPhoneNumberId) {
      return {
        ...env,
        phoneNumberId: org.waPhoneNumberId,
      };
    }
    return env;
  }
}

export async function isWhatsAppConfiguredForOrg(
  organizationId: string,
): Promise<boolean> {
  const config = await getOrganizationWhatsAppConfig(organizationId);
  return config !== null;
}

/** Compatibilidad: env global configurado. */
export function isWhatsAppConfigured(): boolean {
  return getEnvWhatsAppConfig() !== null;
}

export async function verifyWhatsAppWebhookToken(
  token: string,
): Promise<boolean> {
  const env = getEnvWhatsAppConfig();
  if (env?.verifyToken === token) return true;

  const match = await prisma.organization.findFirst({
    where: { waVerifyToken: token },
    select: { id: true },
  });
  return match !== null;
}

/**
 * Resuelve la organización y credenciales a partir del phone_number_id del webhook.
 */
export async function resolveOrganizationForPhoneNumberId(
  phoneNumberId: string,
): Promise<{ organizationId: string; credentials: WhatsAppCredentials } | null> {
  const org = await prisma.organization.findFirst({
    where: { waPhoneNumberId: phoneNumberId },
    select: {
      id: true,
      waAccessToken: true,
      waPhoneNumberId: true,
      waVerifyToken: true,
      waGraphApiVersion: true,
    },
  });

  if (org) {
    const credentials = mergeCredentials(org);
    if (credentials) {
      return { organizationId: org.id, credentials };
    }
  }

  const env = getEnvWhatsAppConfig();
  if (!env || env.phoneNumberId !== phoneNumberId) return null;

  const fallbackOrgId = readEnv("WHATSAPP_DEFAULT_ORG_ID");
  if (fallbackOrgId) {
    const byDefault = await prisma.organization.findUnique({
      where: { id: fallbackOrgId },
      select: { id: true },
    });
    if (byDefault) {
      return { organizationId: byDefault.id, credentials: env };
    }
  }

  const firstOrg = await prisma.organization.findFirst({
    where: { billingStatus: { in: ["ACTIVE", "EXEMPT"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (firstOrg) {
    return { organizationId: firstOrg.id, credentials: env };
  }

  return null;
}
