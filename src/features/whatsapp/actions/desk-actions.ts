"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  countUnreadDeskThreads,
  createDeskThread,
  getDeskThread,
  listDeskThreadsForUser,
  listOrgAgentsForDesk,
  markDeskThreadRead,
  sendDeskMessage,
} from "@/features/whatsapp/services/desk-chat-service";
import { getSessionForOrg } from "@/features/whatsapp/services/session-service";
import { WHATSAPP_AGENT_AREA_LABELS } from "@/features/whatsapp/lib/areas";
import { parseBotPayload } from "@/features/whatsapp/lib/lead-sync";
import { requireModule, requireStaff } from "@/lib/session";
import type { ActionResult } from "@/server/actions/users";

export type DeskActionResult = ActionResult & {
  message?: string;
  threadId?: string;
};

export async function listDeskThreadsAction() {
  const session = await requireModule("whatsapp");
  await requireStaff();
  return listDeskThreadsForUser(session.organizationId, session.user.id);
}

export async function getDeskThreadAction(threadId: string) {
  const session = await requireModule("whatsapp");
  await requireStaff();
  const thread = await getDeskThread(
    threadId,
    session.organizationId,
    session.user.id,
  );
  if (thread) {
    await markDeskThreadRead({
      threadId,
      organizationId: session.organizationId,
      userId: session.user.id,
    });
  }
  return thread;
}

export async function countUnreadDeskThreadsAction() {
  const session = await requireModule("whatsapp");
  await requireStaff();
  return countUnreadDeskThreads(session.organizationId, session.user.id);
}

export async function markDeskThreadReadAction(threadId: string) {
  const session = await requireModule("whatsapp");
  await requireStaff();
  await markDeskThreadRead({
    threadId,
    organizationId: session.organizationId,
    userId: session.user.id,
  });
  revalidatePath("/whatsapp/equipo");
  return { ok: true as const };
}

export async function listDeskAgentsAction() {
  const session = await requireModule("whatsapp");
  await requireStaff();
  const agents = await listOrgAgentsForDesk(session.organizationId);
  return agents.filter((a) => a.userId !== session.user.id);
}

export async function getWhatsAppContextForDeskAction(sessionId: string) {
  const session = await requireModule("whatsapp");
  await requireStaff();
  const chat = await getSessionForOrg(sessionId, session.organizationId);
  if (!chat) return null;
  const payload = parseBotPayload(chat.botPayload);
  const lines = [
    `Cliente: ${chat.waContactName ?? chat.waContactPhone}`,
    `Tel: ${chat.waContactPhone}`,
    chat.requestedArea
      ? `Área: ${WHATSAPP_AGENT_AREA_LABELS[chat.requestedArea]}`
      : null,
    payload.intent ? `Intención: ${payload.intent}` : null,
    payload.zone ? `Zona: ${payload.zone}` : null,
    payload.budget ? `Presupuesto: ${payload.budget}` : null,
    payload.propertyType ? `Tipo: ${payload.propertyType}` : null,
    payload.areaNote ? `Consulta: ${payload.areaNote}` : null,
  ].filter(Boolean);
  return {
    sessionId: chat.id,
    summary: lines.join("\n"),
    title: `Consulta · ${chat.waContactName ?? chat.waContactPhone}`,
  };
}

const createSchema = z.object({
  participantUserIds: z.array(z.string().min(1)).min(1),
  title: z.string().max(120).optional(),
  relatedWhatsAppSessionId: z.string().optional(),
  initialMessage: z.string().min(1).max(4000),
});

export async function createDeskThreadAction(
  input: z.infer<typeof createSchema>,
): Promise<DeskActionResult> {
  try {
    const session = await requireModule("whatsapp");
    await requireStaff();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos inválidos." };
    }

    const thread = await createDeskThread({
      organizationId: session.organizationId,
      createdById: session.user.id,
      participantUserIds: parsed.data.participantUserIds,
      title: parsed.data.title,
      relatedWhatsAppSessionId: parsed.data.relatedWhatsAppSessionId,
      initialMessage: parsed.data.initialMessage,
    });

    revalidatePath("/whatsapp/equipo");
    return { ok: true, threadId: thread.id, message: "Conversación creada." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NEED_PARTICIPANTS") {
      return { ok: false, error: "Elegí al menos un compañero." };
    }
    return { ok: false, error: "No se pudo crear el hilo." };
  }
}

const sendSchema = z.object({
  threadId: z.string().min(1),
  body: z.string().min(1).max(4000),
});

export async function sendDeskMessageAction(
  _prev: DeskActionResult | null,
  formData: FormData,
): Promise<DeskActionResult> {
  try {
    const session = await requireModule("whatsapp");
    await requireStaff();
    const parsed = sendSchema.safeParse({
      threadId: formData.get("threadId"),
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return { ok: false, error: "Mensaje inválido." };
    }

    await sendDeskMessage({
      threadId: parsed.data.threadId,
      organizationId: session.organizationId,
      senderId: session.user.id,
      body: parsed.data.body,
    });

    revalidatePath("/whatsapp/equipo");
    return { ok: true, message: "Enviado." };
  } catch {
    return { ok: false, error: "No se pudo enviar." };
  }
}
