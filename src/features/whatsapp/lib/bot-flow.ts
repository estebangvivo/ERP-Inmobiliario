import type { WhatsAppAgentArea, WhatsAppChatSession } from "@prisma/client";
import type { WhatsAppCredentials } from "@/features/whatsapp/lib/config";
import {
  sendWhatsAppList,
  sendWhatsAppText,
} from "@/features/whatsapp/lib/meta-client";
import { parseBotPayload, upsertLeadFromWhatsAppBot } from "@/features/whatsapp/lib/lead-sync";
import {
  AREA_MENU_ROWS,
  areaFromButtonId,
  matchAreaFromFreeText,
  matchAreaFromMenuChoice,
  matchSalesIntentFromFreeText,
  parseMenuChoiceNumber,
  WHATSAPP_AGENT_AREA_LABELS,
} from "@/features/whatsapp/lib/areas";
import type {
  BotPayload,
  BotStep,
  ClientMenuAction,
  WhatsAppIntent,
} from "@/features/whatsapp/lib/types";
import { prisma } from "@/lib/prisma";
import { publishWhatsAppInboxEvent } from "@/features/whatsapp/lib/event-bus";
import { listWhatsAppEligibleAgents } from "@/features/whatsapp/services/agent-eligibility";
import { recordOutboundBotMessage } from "@/features/whatsapp/services/message-service";
import {
  autoRouteChatSession,
  autoRouteChatSessionAmongUsers,
} from "@/features/whatsapp/services/agent-routing-service";
import { matchOrgAreaFromText } from "@/features/whatsapp/services/org-area-service";
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
  area?: WhatsAppAgentArea | null,
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
        area,
      });
    }
  } catch {
    /* ignore */
  }
}

/** Menú comercial: Alquilar / Comprar / Tasar / Contactar asesor. */
const CLIENT_COMMERCIAL_ROWS = [
  { id: "intent_rent", title: "Alquilar", description: "Busco alquilar" },
  { id: "intent_buy", title: "Comprar", description: "Busco comprar" },
  { id: "intent_appraise", title: "Tasar", description: "Tasar mi inmueble" },
  {
    id: "intent_agent",
    title: "Contactar con un asesor",
    description: "Elegir área",
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
    case "intent_rent":
    case "intent_buy":
    case "intent_appraise":
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
      description: profile.isGuarantor
        ? "Como inquilino / garante"
        : "Estado y vigencia",
    });
  }

  if (
    profile.isOwner ||
    profile.ownedProperties.length > 0 ||
    profile.rentedProperties.length > 0
  ) {
    rows.push({
      id: "client_properties",
      title: profile.isOwner ? "Mis propiedades" : "Mi propiedad",
      description: profile.isOwner
        ? "Disponibles, alquiladas y más"
        : "Inmueble que alquilás",
    });
  }

  for (const row of CLIENT_COMMERCIAL_ROWS) {
    rows.push({
      id: row.id,
      title: row.title,
      description: row.description,
    });
  }

  return rows.slice(0, 10);
}

async function updateSessionBotState(
  sessionId: string,
  data: {
    botStep?: BotStep | null;
    botPayload?: BotPayload;
    status?: "BOT_ACTIVE" | "WAITING_AGENT" | "AGENT_HANDLED" | "CLOSED";
    leadId?: string;
    requestedArea?: WhatsAppAgentArea | null;
  },
) {
  return prisma.whatsAppChatSession.update({
    where: { id: sessionId },
    data: {
      botStep: data.botStep ?? undefined,
      botPayload: data.botPayload ?? undefined,
      status: data.status,
      leadId: data.leadId,
      ...(data.requestedArea !== undefined
        ? { requestedArea: data.requestedArea }
        : {}),
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
  // Texto primero: más fiable que listas interactivas de Meta en varios WABA.
  const textBody = [
    body,
    "",
    ...rows.map(
      (r, i) =>
        `${i + 1}. ${r.title}${r.description ? ` — ${r.description}` : ""}`,
    ),
    "",
    "Respondé con el número o el nombre de la opción.",
  ].join("\n");

  let waId: string | null = null;
  let messageType: "interactive" | "text" = "text";
  let recordedBody = textBody;

  try {
    waId = await sendWhatsAppText({
      credentials,
      toPhone: session.waContactPhone,
      body: textBody,
    });
  } catch (textErr) {
    console.warn(
      "whatsapp text menu failed, trying interactive list",
      session.id,
      textErr,
    );
    waId = await sendWhatsAppList({
      credentials,
      toPhone: session.waContactPhone,
      body,
      buttonLabel: "Ver opciones",
      rows,
    });
    messageType = "interactive";
    recordedBody = body;
  }

  await recordOutboundBotMessage({
    sessionId: session.id,
    organizationId: session.organizationId,
    body: recordedBody,
    waMessageId: waId,
    messageType,
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
  if (!profile) return { ...payload, isClient: false };
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
  const profile = await lookupWhatsAppContact(
    session.organizationId,
    session.waContactPhone,
    session.waContactName,
  );
  if (profile && payload.userId && profile.userId === payload.userId) {
    return {
      payload: payloadFromProfile(payload, profile),
      profile,
    };
  }
  return { payload: payloadFromProfile(payload, profile), profile };
}

async function sendAreaMenu(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  profile: WhatsAppContactProfile | null,
) {
  const name = greetingName(profile, session, payload);
  const body = name
    ? `¡Hola ${name}! Soy el asistente de la inmobiliaria. ¿Con qué área te podemos ayudar?`
    : "¡Hola! Soy el asistente de la inmobiliaria. ¿Con qué área te podemos ayudar?";

  await sendBotList(
    session,
    credentials,
    body,
    AREA_MENU_ROWS.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
    })),
    "AREA_MENU",
    payload,
  );
}

async function sendSalesIntentMenu(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
) {
  await sendBotList(
    session,
    credentials,
    "Perfecto. ¿Qué necesitás?",
    CLIENT_COMMERCIAL_ROWS.map((r) => ({
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
  const bits: string[] = [];
  if (profile.isTenant) bits.push("inquilino");
  if (profile.isOwner) bits.push("propietario");
  if (profile.isGuarantor && !profile.isTenant && !profile.isOwner) {
    bits.push("garante");
  }
  const roleHint =
    bits.length > 0 ? ` Te reconocimos como ${bits.join(" y ")}.` : "";
  const body = `¡Hola ${profile.firstName}! Encontramos tu número en el sistema.${roleHint} ¿Qué querés consultar?`;
  await sendBotList(
    session,
    credentials,
    body,
    buildClientMenuRows(profile),
    "CLIENT_MENU",
    payloadFromProfile(payload, profile),
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
  await sendAreaMenu(
    session,
    credentials,
    payloadFromProfile(payload, profile),
    profile,
  );
}

async function publishWaitingAgentEvent(input: {
  organizationId: string;
  sessionId: string;
  leadId: string | null;
  phone: string;
  contactName: string | null;
  area: WhatsAppAgentArea | null;
}) {
  const agents = await listWhatsAppEligibleAgents(input.organizationId, {
    area: input.area,
  });
  const areaLabel = input.area
    ? WHATSAPP_AGENT_AREA_LABELS[input.area]
    : "WhatsApp";
  publishWhatsAppInboxEvent({
    type: "session.waiting_agent",
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    payload: {
      leadId: input.leadId,
      phone: input.phone,
      area: input.area,
      notifyUserIds: agents.map((a) => a.userId),
      senderName: input.contactName ?? input.phone,
      preview: `Nueva consulta · ${areaLabel}`,
      href: `/whatsapp?session=${input.sessionId}`,
    },
  });
}

async function requestHumanHandoff(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  area?: WhatsAppAgentArea | null,
) {
  const requestedArea = area ?? payload.area ?? null;
  const leadId = await upsertLeadFromWhatsAppBot({
    organizationId: session.organizationId,
    phone: session.waContactPhone,
    contactName: session.waContactName,
    payload: { ...payload, area: requestedArea ?? undefined },
    existingLeadId: session.leadId,
  });

  await updateSessionBotState(session.id, {
    botStep: null,
    botPayload: { ...payload, area: requestedArea ?? undefined },
    status: "WAITING_AGENT",
    leadId,
    requestedArea,
  });

  const areaLabel = requestedArea
    ? WHATSAPP_AGENT_AREA_LABELS[requestedArea]
    : "un asesor";
  await sendBotText(
    session,
    credentials,
    `Perfecto. Te vamos a conectar con ${areaLabel}. Un agente te atenderá en breve.`,
  );

  await publishWaitingAgentEvent({
    organizationId: session.organizationId,
    sessionId: session.id,
    leadId,
    phone: session.waContactPhone,
    contactName: session.waContactName,
    area: requestedArea,
  });

  await tryAutoRoute(session.id, session.organizationId, requestedArea);
}

/**
 * Si el texto menciona un Área de la empresa (ABM de áreas), deriva la consulta
 * a los agentes de esa área. Devuelve true si manejó el mensaje.
 */
async function tryOrgAreaHandoff(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  text: string,
): Promise<boolean> {
  const match = await matchOrgAreaFromText(session.organizationId, text);
  if (!match) return false;

  const nextPayload: BotPayload = {
    ...payload,
    area: undefined,
    orgAreaName: match.name,
    areaNote: text,
  };
  const leadId = await upsertLeadFromWhatsAppBot({
    organizationId: session.organizationId,
    phone: session.waContactPhone,
    contactName: session.waContactName,
    payload: nextPayload,
    existingLeadId: session.leadId,
  });

  await updateSessionBotState(session.id, {
    botStep: null,
    botPayload: nextPayload,
    status: "WAITING_AGENT",
    leadId,
    requestedArea: null,
  });

  await sendBotText(
    session,
    credentials,
    `Perfecto. Te vamos a conectar con alguien del área de *${match.name}*. Te atenderán en breve.`,
  );

  // Avisa a las personas del área; si no hay ninguna cargada, a los agentes de WhatsApp.
  const notifyUserIds =
    match.agentUserIds.length > 0
      ? match.agentUserIds
      : (await listWhatsAppEligibleAgents(session.organizationId)).map(
          (a) => a.userId,
        );
  publishWhatsAppInboxEvent({
    type: "session.waiting_agent",
    organizationId: session.organizationId,
    sessionId: session.id,
    payload: {
      leadId,
      phone: session.waContactPhone,
      area: null,
      notifyUserIds,
      senderName: session.waContactName ?? session.waContactPhone,
      preview: `Nueva consulta · ${match.name}`,
      href: `/whatsapp?session=${session.id}`,
    },
  });

  try {
    const org = await prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { waRoutingMode: true },
    });
    if (org?.waRoutingMode && org.waRoutingMode !== "MANUAL") {
      await autoRouteChatSessionAmongUsers({
        sessionId: session.id,
        organizationId: session.organizationId,
        routingMode: org.waRoutingMode,
        candidateUserIds: match.agentUserIds,
      });
    }
  } catch {
    /* queda en espera para toma manual */
  }
  return true;
}

async function handleAreaSelection(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  area: WhatsAppAgentArea,
) {
  const nextPayload: BotPayload = { ...payload, area };

  if (area === "SALES_RENTALS") {
    // Enviar primero: si Meta falla, no dejamos el chat en un paso inconsistente.
    await sendSalesIntentMenu(session, credentials, nextPayload);
    await updateSessionBotState(session.id, {
      botStep: "MAIN_MENU",
      botPayload: nextPayload,
      requestedArea: area,
      status: "BOT_ACTIVE",
    });
    return;
  }

  await sendBotText(
    session,
    credentials,
    `Contanos brevemente tu consulta de ${WHATSAPP_AGENT_AREA_LABELS[area]}:`,
  );
  await updateSessionBotState(session.id, {
    botStep: "COLLECT_AREA_NOTE",
    botPayload: nextPayload,
    requestedArea: area,
    status: "BOT_ACTIVE",
  });
}

async function handleClientMenuAction(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  profile: WhatsAppContactProfile,
  action: ClientMenuAction,
) {
  if (action === "intent_agent") {
    await sendAreaMenu(session, credentials, payload, profile);
    return;
  }

  if (
    action === "intent_rent" ||
    action === "intent_buy" ||
    action === "intent_appraise"
  ) {
    const intent = intentFromButtonId(action);
    if (!intent) return;
    const nextPayload: BotPayload = {
      ...payload,
      area: "SALES_RENTALS",
    };
    await startProspectFlow(session, credentials, nextPayload, intent);
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

async function resolvePublicCatalogUrl(
  organizationId: string,
): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { website: true },
  });
  const website = org?.website?.trim();
  if (website) {
    return website.endsWith("/") ? website : `${website}/`;
  }
  // Fallback del catálogo público de Poblar cuando la org no tiene website cargado.
  return "https://inmobiliariapoblar.com.ar/";
}

function catalogRedirectMessage(catalogUrl: string, intent: "BUY" | "RENT"): string {
  const advisor =
    intent === "RENT" ? "Alquileres" : "Ventas";
  return [
    "Para consultar propiedades disponibles, por favor dirigite a:",
    catalogUrl,
    "",
    `Si alguna de las propiedades es de tu interés, decime la dirección y te derivo con un asesor de *${advisor}*.`,
  ].join("\n");
}

async function sendCatalogRedirect(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  intent: "BUY" | "RENT",
) {
  const catalogUrl = await resolvePublicCatalogUrl(session.organizationId);
  const nextPayload: BotPayload = {
    ...payload,
    intent,
    area: payload.area ?? "SALES_RENTALS",
  };
  await updateSessionBotState(session.id, {
    botStep: "COLLECT_PROPERTY_INTEREST",
    botPayload: nextPayload,
    requestedArea: nextPayload.area ?? "SALES_RENTALS",
  });
  await sendBotText(
    session,
    credentials,
    catalogRedirectMessage(catalogUrl, intent),
  );
}

async function startProspectFlow(
  session: WhatsAppChatSession,
  credentials: WhatsAppCredentials,
  payload: BotPayload,
  intent: WhatsAppIntent,
) {
  const nextPayload: BotPayload = {
    ...payload,
    intent,
    area: payload.area ?? "SALES_RENTALS",
  };

  if (intent === "AGENT") {
    await requestHumanHandoff(
      session,
      credentials,
      nextPayload,
      nextPayload.area,
    );
    return;
  }

  if (intent === "APPRAISE") {
    await updateSessionBotState(session.id, {
      botStep: "COLLECT_ZONE",
      botPayload: nextPayload,
      requestedArea: nextPayload.area ?? "SALES_RENTALS",
    });
    await sendBotText(
      session,
      credentials,
      "Genial. ¿En qué zona está el inmueble a tasar?",
    );
    return;
  }

  await sendCatalogRedirect(session, credentials, nextPayload, intent);
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

  const step = (session.botStep as BotStep | null) ?? "AREA_MENU";
  const text = normalizeUserText(input.body);
  const textLower = text.toLowerCase();
  const buttonArea = input.interactiveId
    ? areaFromButtonId(input.interactiveId)
    : null;
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
    const clientRows = buildClientMenuRows(profile);
    const choiceN = parseMenuChoiceNumber(text, clientRows.length);
    const actionFromNumber =
      choiceN != null
        ? clientActionFromButtonId(clientRows[choiceN - 1]?.id ?? "")
        : null;
    const actionFromText: ClientMenuAction | null =
      textLower.includes("deuda") ||
      textLower.includes("cuota") ||
      textLower.includes("saldo") ||
      textLower.includes("pago")
        ? "client_debts"
        : textLower.includes("contrato")
          ? "client_contracts"
          : textLower.includes("alquil")
            ? "intent_rent"
            : textLower.includes("compr")
              ? "intent_buy"
              : textLower.includes("tasar") || textLower.includes("tasaci")
                ? "intent_appraise"
                : textLower.includes("asesor") ||
                    textLower.includes("humano") ||
                    textLower.includes("area") ||
                    textLower.includes("área")
                  ? "intent_agent"
                  : textLower.includes("propiedad") ||
                      textLower.includes("inmueble") ||
                      textLower.includes("disponible")
                    ? "client_properties"
                    : null;
    const action = clientAction ?? actionFromNumber ?? actionFromText;

    if (!action) {
      if (await tryOrgAreaHandoff(session, credentials, payload, text)) return;
      await sendClientMenu(session, credentials, payload, profile);
      return;
    }

    await handleClientMenuAction(
      session,
      credentials,
      payloadFromProfile(payload, profile),
      profile,
      action,
    );
    return;
  }

  if (step === "AREA_MENU") {
    const isNumberedChoice =
      parseMenuChoiceNumber(text, AREA_MENU_ROWS.length) != null;
    if (
      !buttonArea &&
      !isNumberedChoice &&
      (await tryOrgAreaHandoff(session, credentials, payload, text))
    ) {
      return;
    }
    const area =
      buttonArea ??
      matchAreaFromMenuChoice(text) ??
      matchAreaFromFreeText(text);

    if (!area) {
      await sendAreaMenu(session, credentials, payload, profile);
      return;
    }

    await handleAreaSelection(session, credentials, payload, area);
    return;
  }

  if (step === "COLLECT_AREA_NOTE") {
    if (!text) {
      await sendBotText(
        session,
        credentials,
        "Por favor contanos brevemente tu consulta.",
      );
      return;
    }
    const area = payload.area ?? session.requestedArea;
    const nextPayload: BotPayload = { ...payload, areaNote: text, area: area ?? undefined };
    await requestHumanHandoff(session, credentials, nextPayload, area);
    return;
  }

  if (step === "MAIN_MENU") {
    const intentFromNumber = (() => {
      const n = parseMenuChoiceNumber(text, CLIENT_COMMERCIAL_ROWS.length);
      if (n == null) return null;
      return intentFromButtonId(CLIENT_COMMERCIAL_ROWS[n - 1]?.id ?? "");
    })();
    const intent =
      buttonIntent ??
      intentFromNumber ??
      (textLower.includes("asesor") ||
      textLower.includes("area") ||
      textLower.includes("área")
        ? ("AGENT" as const)
        : matchSalesIntentFromFreeText(text));

    if (!intent) {
      if (await tryOrgAreaHandoff(session, credentials, payload, text)) return;
      await sendSalesIntentMenu(session, credentials, payload);
      return;
    }

    if (intent === "AGENT") {
      await sendAreaMenu(session, credentials, payload, profile);
      return;
    }

    await startProspectFlow(session, credentials, payload, intent);
    return;
  }

  if (step === "COLLECT_PROPERTY_INTEREST") {
    if (!text) {
      await sendBotText(
        session,
        credentials,
        "Si te interesa alguna propiedad, escribí la dirección. También podés escribir *menu* para volver al inicio.",
      );
      return;
    }

    const intent = payload.intent === "BUY" || payload.intent === "RENT"
      ? payload.intent
      : "RENT";
    const nextPayload: BotPayload = {
      ...payload,
      intent,
      area: payload.area ?? "SALES_RENTALS",
      areaNote: `Propiedad de interés: ${text}`,
    };
    await requestHumanHandoff(
      session,
      credentials,
      nextPayload,
      nextPayload.area,
    );
    return;
  }

  if (step === "COLLECT_ZONE") {
    if (!text) {
      await sendBotText(session, credentials, "Por favor indicá la zona o barrio.");
      return;
    }
    const nextPayload: BotPayload = { ...payload, zone: text };

    // Sesiones viejas de alquiler/venta: redirigir al catálogo web.
    if (payload.intent === "BUY" || payload.intent === "RENT") {
      await sendCatalogRedirect(session, credentials, nextPayload, payload.intent);
      return;
    }

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
    if (payload.intent === "BUY" || payload.intent === "RENT") {
      await sendCatalogRedirect(session, credentials, payload, payload.intent);
      return;
    }

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
    if (payload.intent === "BUY" || payload.intent === "RENT") {
      await sendCatalogRedirect(session, credentials, payload, payload.intent);
      return;
    }

    if (!text) {
      await sendBotText(
        session,
        credentials,
        "Contanos qué tipo de inmueble te interesa.",
      );
      return;
    }
    const nextPayload: BotPayload = {
      ...payload,
      propertyType: text,
      area: payload.area ?? "SALES_RENTALS",
    };
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
      requestedArea: nextPayload.area ?? "SALES_RENTALS",
    });

    await sendBotText(
      session,
      credentials,
      "¡Gracias! Registramos tu consulta de Ventas / Alquileres. Un asesor se comunicará con vos pronto.",
    );

    await publishWaitingAgentEvent({
      organizationId: session.organizationId,
      sessionId: session.id,
      leadId,
      phone: session.waContactPhone,
      contactName: session.waContactName,
      area: nextPayload.area ?? "SALES_RENTALS",
    });

    await tryAutoRoute(
      session.id,
      session.organizationId,
      nextPayload.area ?? "SALES_RENTALS",
    );
    return;
  }

  if (await tryOrgAreaHandoff(session, credentials, payload, text)) return;

  if (textLower.includes("asesor")) {
    await sendAreaMenu(session, credentials, payload, profile);
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

  // Si reconocemos a la persona, dejamos el nombre en la sesión del inbox.
  if (profile?.name && profile.name !== session.waContactName) {
    await prisma.whatsAppChatSession.update({
      where: { id: session.id },
      data: { waContactName: profile.name },
    });
    session = { ...session, waContactName: profile.name };
  }

  await sendWelcomeMenu(session, credentials, resolvedPayload, profile);
}
