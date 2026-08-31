import type {
  WhatsAppChatStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageSenderType,
} from "@prisma/client";
import type { OrganizationRole } from "@prisma/client";

export type WhatsAppIntent = "BUY" | "RENT" | "APPRAISE" | "AGENT";

export type BotStep =
  | "CLIENT_MENU"
  | "MAIN_MENU"
  | "COLLECT_ZONE"
  | "COLLECT_BUDGET"
  | "COLLECT_PROPERTY_TYPE"
  | "COMPLETED";

export type ClientMenuAction =
  | "client_debts"
  | "client_contracts"
  | "client_properties"
  | "client_commercial"
  | "intent_agent";

export type BotPayload = {
  intent?: WhatsAppIntent;
  zone?: string;
  budget?: string;
  propertyType?: string;
  userId?: string;
  contactFirstName?: string;
  orgRole?: OrganizationRole;
  isClient?: boolean;
};

export type WhatsAppInboxEventType =
  | "session.updated"
  | "message.created"
  | "session.waiting_agent";

export type WhatsAppInboxEvent = {
  type: WhatsAppInboxEventType;
  organizationId: string;
  sessionId: string;
  payload?: Record<string, unknown>;
};

export type InboundWhatsAppMessage = {
  waMessageId: string;
  fromPhone: string;
  contactName?: string;
  phoneNumberId: string;
  body: string;
  messageType: string;
  interactiveId?: string;
  raw: unknown;
};

export type SessionListItem = {
  id: string;
  waContactPhone: string;
  waContactName: string | null;
  status: WhatsAppChatStatus;
  botStep: string | null;
  botPayload: BotPayload | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  leadId: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
};

export type MessageListItem = {
  id: string;
  direction: WhatsAppMessageDirection;
  senderType: WhatsAppMessageSenderType;
  body: string;
  messageType: string;
  sentByUserName: string | null;
  createdAt: string;
};

export const WHATSAPP_CHAT_STATUS_LABELS: Record<WhatsAppChatStatus, string> = {
  BOT_ACTIVE: "Bot activo",
  WAITING_AGENT: "Esperando agente",
  AGENT_HANDLED: "Con agente",
  CLOSED: "Cerrado",
};

export const WHATSAPP_INTENT_LABELS: Record<WhatsAppIntent, string> = {
  BUY: "Comprar",
  RENT: "Alquilar",
  APPRAISE: "Tasar",
  AGENT: "Hablar con asesor",
};
