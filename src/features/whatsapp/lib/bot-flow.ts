import type { WhatsAppChatSession } from "@prisma/client";
import type { WhatsAppCredentials } from "@/features/whatsapp/lib/config";
import {
  sendWhatsAppList,
  sendWhatsAppText,
} from "@/features/whatsapp/lib/meta-client";
import { parseBotPayload, upsertLeadFromWhatsAppBot } from "@/features/whatsapp/lib/lead-sync";
import type {
  BotPayload,
  BotStep,
  ClientMenuAction,
  WhatsAppIntent,
} from "@/features/whatsapp/lib/types";
import { prisma } from "@/lib/prisma";
import { publishWhatsAppInboxEvent } from "@/features/whatsapp/lib/event-bus";
import { recordOutboundBotMessage } from "@/features/whatsapp/services/message-service";
import { autoRouteChatSession } from "@/features/whatsapp/services/agent-routing-service";
import {
  lookupWhatsAppContact,
  type WhatsAppContactProfile,
} from "@/features/whatsapp/services/contact-lookup-service";
import {
  buildClientContractsMessage,
  buildClientDebtsMessage,
  buildClientPropertiesMessage,
} from "@/features/whatsapp/services/client-self-service";

async function tryAutoRoute(
  sessionId: string,
  organizationId: string,
): Promise<void> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { waRoutingMode: true },
    });
    if (org?.waRoutingMode && org.waRoutingMode !== "MANUAL") {
      await autoRouteChatSession({
        sessionId,
        organizationId,
        routingMode: org.waRoutingMode,
      });
    }
  } catch {
    /* Cliente Prisma desactualizado */
  }
}

const PROSPECT_ROWS = [
  { id: "intent_buy", title: "Comprar", description: "Busco comprar propiedad" },
  { id: "intent_rent", title: "Alquilar", description: "Busco alquilar" },
  { id: "intent_appraise", title: "Tasar", description: "Quiero tasar mi inmueble" },
  {
    id: "intent_agent",
    title: "Hablar con asesor",
    description: "Atención humana",
  },
] as const;

function intentFromButtonId(id: string): WhatsAppIntent | null {
  switch (id) {
    case "intent_buy":
      return "BUY";
    case "intent_rent":
      return "RENT";
    case "intent_appraise":
      return "APPRAISE";
    case "intent_agent":
      return "AGENT";
    default:
      return null;
  }
}

function clientActionFromButtonId(id: string): ClientMenuAction | null {
  switch (id) {
    case "client_debts":
    case "client_contracts":
    case "client_properties":
    case "client_commercial":
    case "intent_agent":
      return id;
    default:
      return null;
  }
}

function normalizeUserText(body: string): string {
  return body.trim();
}

function greetingName(
  profile: WhatsAppContactProfile | null,
  session: WhatsAppChatSession,
  payload: BotPayload,
): string | null {
  if (profile?.firstName) return profile.firstName;
  if (payload.contactFirstName) return payload.contactFirstName;
  const waName = session.waContactName?.trim().split(/\s+/)[0];
  return waName || null;
}

function buildClientMenuRows(profile: WhatsAppContactProfile) {
  const rows: Array<{ id: string; title: string; description: string }> = [];

  if (profile.isTenant) {
    rows.push({
      id: "client_debts",
      title: "Mis deudas",
      description: "Cuotas pendientes y saldo",
    });
  }

  if (profile.contracts.length > 0) {
    rows.push({
      id: "client_contracts",
      title: "Mis contratos",
      description: "Estado y vigencia",
    });
  }

  if (profile.isOwner || profile.rentedProperties.length > 0) {
    rows.push({
      id: "client_properties",
      title: profile.isOwner ? "Mis propiedades" : "Mi propiedad",
      description: "Inmuebles vinculados",
    });
  }

  rows.push({
    id: "client_commercial",
    title: "Buscar propiedad",
    description: "Comprar, alquilar o tasar",
  });

  rows.push({
    id: "intent_agent",
    title: "Hablar con asesor",
    description: "Atención humana",
  });

  return rows.slice(0, 10);
}

async function updateSessionBotState(
  sessionId: string,
  data: {
    botStep?: BotStep | null;
    botPayload?: BotPayload;
    status?: "BOT_ACTIVE" | "WAITING_AGENT" | "AGENT_HANDLED" | "CLOSED";
    leadId?: string;
  },
) {
  return prisma.whatsAppChatSession.update({
    where: { id: sessionId },
    data: {
      botStep: data.botStep ?? undefined,
      botPayload: data.botPayload ?? undefined,
      status: data.status,
      leadId: data.leadId,
      lastMessageAt: new Date(),
    },
  });
}

async function sendBotText(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  body: string,
) {
  const waId = await sendWhatsAppText({
    credentials,
    toPhone: session.waContactPhone,
    body,
  });
  await recordOutboundBotMessage({
    sessionId: session.id,
    organizationId: session.organizationId,
    body,
    waMessageId: waId,
    messageType: "text",
  });
}

async function sendBotList(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  body: string,
  rows: Array<{ id: string; title: string; description: string }>,
  step: BotStep,
  payload: BotPayload,
) {
  const waId = await sendWhatsAppList({
    credentials,
    toPhone: session.waContactPhone,
    body,
    buttonLabel: "Ver opciones",
    rows,
  });
  await recordOutboundBotMessage({
    sessionId: session.id,
    organizationId: session.organizationId,
    body,
    waMessageId: waId,
    messageType: "interactive",
  });
  await updateSessionBotState(session.id, {
    botStep: step,
    botPayload: payload,
    status: "BOT_ACTIVE",
  });
}

function payloadFromProfile(
  payload: BotPayload,
  profile: WhatsAppContactProfile | null,
): BotPayload {
  if (!profile) return payload;
  return {
    ...payload,
    userId: profile.userId,
    contactFirstName: profile.firstName,
    orgRole: profile.orgRole,
    isClient: profile.isClient,
  };
}

async function resolveContact(
  session: WhatsAppChatSession,
  payload: BotPayload,
): Promise<{ payload: BotPayload; profile: WhatsAppContactProfile | null }> {
  if (payload.userId && payload.isClient) {
    const profile = await lookupWhatsAppContact(
      session.organizationId,
      session.waContactPhone,
    );
    if (profile?.userId === payload.userId) {
      return { payload, profile };
    }
  }

  const profile = await lookupWhatsAppContact(
    session.organizationId,
    session.waContactPhone,
  );
  return { payload: payloadFromProfile(payload, profile), profile };
}

async function sendProspectMenu(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  profile: WhatsAppContactProfile | null,
) {
  const name = greetingName(profile, session, payload);
  const body = name
    ? `¡Hola ${name}! Soy el asistente de la inmobiliaria. ¿En qué podemos ayudarte?`
    : "¡Hola! Soy el asistente de la inmobiliaria. ¿En qué podemos ayudarte?";

  await sendBotList(
    session,
    credentials,
    body,
    PROSPECT_ROWS.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
    })),
    "MAIN_MENU",
    payload,
  );
}

async function sendClientMenu(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  profile: WhatsAppContactProfile,
) {
  const body = `¡Hola ${profile.firstName}! ¿Qué querés consultar hoy?`;
  await sendBotList(
    session,
    credentials,
    body,
    buildClientMenuRows(profile),
    "CLIENT_MENU",
    payload,
  );
}

async function sendWelcomeMenu(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  profile: WhatsAppContactProfile | null,
) {
  if (profile?.isClient) {
    await sendClientMenu(session, credentials, payload, profile);
    return;
  }
  await sendProspectMenu(session, credentials, payload, profile);
}

async function requestHumanHandoff(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
) {
  const leadId = await upsertLeadFromWhatsAppBot({
    organizationId: session.organizationId,
    phone: session.waContactPhone,
    contactName: session.waContactName,
    payload,
    existingLeadId: session.leadId,
  });

  await updateSessionBotState(session.id, {
    botStep: null,
    botPayload: payload,
    status: "WAITING_AGENT",
    leadId,
  });

  await sendBotText(
    session,
    credentials,
    "Perfecto. Un asesor humano va a atenderte en breve. Gracias por tu paciencia.",
  );

  publishWhatsAppInboxEvent({
    type: "session.waiting_agent",
    organizationId: session.organizationId,
    sessionId: session.id,
    payload: { leadId, phone: session.waContactPhone },
  });

  await tryAutoRoute(session.id, session.organizationId);
}

async function handleClientMenuAction(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  profile: WhatsAppContactProfile,
  action: ClientMenuAction,
) {
  if (action === "intent_agent") {
    await requestHumanHandoff(session, credentials, payload);
    return;
  }

  if (action === "client_commercial") {
    await sendProspectMenu(session, credentials, payload, profile);
    return;
  }

  let message = "";
  if (action === "client_debts") {
    if (!profile.isTenant) {
      message = "Esta consulta está disponible para inquilinos.";
    } else {
      message = await buildClientDebtsMessage(
        session.organizationId,
        profile.userId,
      );
    }
  } else if (action === "client_contracts") {
    message = buildClientContractsMessage(profile);
  } else if (action === "client_properties") {
    message = buildClientPropertiesMessage(profile);
  }

  await sendBotText(session, credentials, message);
  await sendBotText(
    session,
    credentials,
    "Escribí *menu* para volver al menú principal.",
  );
  await updateSessionBotState(session.id, {
    botStep: "CLIENT_MENU",
    botPayload: payload,
  });
}

async function startProspectFlow(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  intent: WhatsAppIntent,
) {
  const nextPayload: BotPayload = { ...payload, intent };

  if (intent === "AGENT") {
    await requestHumanHandoff(session, credentials, nextPayload);
    return;
  }

  await updateSessionBotState(session.id, {
    botStep: "COLLECT_ZONE",
    botPayload: nextPayload,
  });
  await sendBotText(
    session,
    credentials,
    "Genial. ¿En qué zona o barrio estás buscando?",
  );
}

export type BotProcessInput = {
  session: WhatsAppChatSession;
  credentials: WhatsAppCredentials;
  body: string;
  interactiveId?: string;
};

export async function processBotMessage(input: BotProcessInput): Promise<void> {
  const { session, credentials } = input;
  if (session.status !== "BOT_ACTIVE") return;

  let payload = parseBotPayload(session.botPayload);
  const { payload: resolvedPayload, profile } = await resolveContact(
    session,
    payload,
  );
  payload = resolvedPayload;

  const step = (session.botStep as BotStep | null) ?? "MAIN_MENU";
  const text = normalizeUserText(input.body);
  const textLower = text.toLowerCase();
  const buttonIntent = input.interactiveId
    ? intentFromButtonId(input.interactiveId)
    : null;
  const clientAction = input.interactiveId
    ? clientActionFromButtonId(input.interactiveId)
    : null;

  if (textLower === "menu" || textLower === "menú") {
    await sendWelcomeMenu(session, credentials, payload, profile);
    return;
  }

  if (step === "CLIENT_MENU" && profile?.isClient) {
    const action =
      clientAction ??
      (textLower.includes("deuda") || textLower.includes("cuota")
        ? "client_debts"
        : textLower.includes("contrato")
          ? "client_contracts"
          : textLower.includes("propiedad") || textLower.includes("inmueble")
            ? "client_properties"
            : textLower.includes("asesor")
              ? "intent_agent"
              : textLower.includes("buscar") ||
                  textLower.includes("comprar") ||
                  textLower.includes("alquilar")
                ? "client_commercial"
                : null);

    if (!action) {
      await sendClientMenu(session, credentials, payload, profile);
      return;
    }

    await handleClientMenuAction(
      session,
      credentials,
      payload,
      profile,
      action,
    );
    return;
  }

  if (step === "MAIN_MENU") {
    const intent =
      buttonIntent ??
      (textLower.includes("comprar")
        ? "BUY"
        : textLower.includes("alquilar")
          ? "RENT"
          : textLower.includes("tas")
            ? "APPRAISE"
            : textLower.includes("asesor")
              ? "AGENT"
              : null);

    if (!intent) {
      if (profile?.isClient && payload.isClient) {
        await sendClientMenu(session, credentials, payload, profile);
      } else {
        await sendProspectMenu(session, credentials, payload, profile);
      }
      return;
    }

    await startProspectFlow(session, credentials, payload, intent);
    return;
  }

  if (step === "COLLECT_ZONE") {
    if (!text) {
      await sendBotText(session, credentials, "Por favor indicá la zona o barrio.");
      return;
    }
    const nextPayload: BotPayload = { ...payload, zone: text };
    await updateSessionBotState(session.id, {
      botStep: "COLLECT_BUDGET",
      botPayload: nextPayload,
    });
    await sendBotText(
      session,
      credentials,
      "¿Cuál es tu presupuesto aproximado? (ej. USD 150.000 o ARS 500.000)",
    );
    return;
  }

  if (step === "COLLECT_BUDGET") {
    if (!text) {
      await sendBotText(session, credentials, "Indicá un presupuesto aproximado.");
      return;
    }
    const nextPayload: BotPayload = { ...payload, budget: text };
    await updateSessionBotState(session.id, {
      botStep: "COLLECT_PROPERTY_TYPE",
      botPayload: nextPayload,
    });
    await sendBotText(
      session,
      credentials,
      "¿Qué tipo de inmueble buscás? (ej. departamento 2 ambientes, casa, local)",
    );
    return;
  }

  if (step === "COLLECT_PROPERTY_TYPE") {
    if (!text) {
      await sendBotText(
        session,
        credentials,
        "Contanos qué tipo de inmueble te interesa.",
      );
      return;
    }
    const nextPayload: BotPayload = { ...payload, propertyType: text };
    const leadId = await upsertLeadFromWhatsAppBot({
      organizationId: session.organizationId,
      phone: session.waContactPhone,
      contactName: session.waContactName,
      payload: nextPayload,
      existingLeadId: session.leadId,
    });

    await updateSessionBotState(session.id, {
      botStep: "COMPLETED",
      botPayload: nextPayload,
      status: "WAITING_AGENT",
      leadId,
    });

    await sendBotText(
      session,
      credentials,
      "¡Gracias! Registramos tu consulta. Un asesor se comunicará con vos pronto. Si preferís hablar ahora, respondé *asesor*.",
    );

    publishWhatsAppInboxEvent({
      type: "session.waiting_agent",
      organizationId: session.organizationId,
      sessionId: session.id,
      payload: { leadId },
    });

    await tryAutoRoute(session.id, session.organizationId);
    return;
  }

  if (textLower.includes("asesor")) {
    await requestHumanHandoff(session, credentials, payload);
    return;
  }

  if (profile?.isClient) {
    await sendClientMenu(session, credentials, payload, profile);
    return;
  }

  await sendBotText(
    session,
    credentials,
    "Escribí *menu* para ver las opciones disponibles.",
  );
}

export async function startBotConversation(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
): Promise<void> {
  const payload = parseBotPayload(session.botPayload);
  const { payload: resolvedPayload, profile } = await resolveContact(
    session,
    payload,
  );
  await sendWelcomeMenu(session, credentials, resolvedPayload, profile);
}
