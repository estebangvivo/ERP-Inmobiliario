"use server";

import { revalidatePath } from "next/cache";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/session";
import { updateLeadStatusAction } from "@/server/actions/leads";

export type AgentDailyActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function assignLeadToMeAction(
  leadId: string,
): Promise<AgentDailyActionResult> {
  const session = await requireModule("consultas");
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!lead) return { ok: false, error: "Consulta no encontrada." };

  await prisma.lead.update({
    where: { id: leadId },
    data: { assigneeId: session.user.id },
  });
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markLeadContactedAction(
  leadId: string,
): Promise<AgentDailyActionResult> {
  const session = await requireModule("consultas");
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      organizationId: session.organizationId,
      status: "NEW",
    },
    select: { id: true },
  });
  if (!lead) return { ok: false, error: "Consulta no encontrada o ya atendida." };

  await updateLeadStatusAction(leadId, "CONTACTED");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function claimUnassignedVisitAction(
  bookingId: string,
): Promise<AgentDailyActionResult> {
  const session = await requireModule("consultas");
  const booking = await prisma.propertyVisitBooking.findFirst({
    where: {
      id: bookingId,
      organizationId: session.organizationId,
      assigneeId: null,
      status: "RESERVED",
    },
    select: { id: true },
  });
  if (!booking) {
    return { ok: false, error: "La visita ya tiene agente o no existe." };
  }

  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId: session.organizationId,
      userId: session.user.id,
      role: { in: ["ADMIN", "AGENT"] },
      user: {
        isActive: true,
        ...excludePlatformSuperadminFromUser(),
      },
    },
  });
  if (!member) {
    return { ok: false, error: "No podés asignarte visitas." };
  }

  await prisma.propertyVisitBooking.update({
    where: { id: bookingId },
    data: { assigneeId: session.user.id },
  });
  revalidatePath("/visitas");
  revalidatePath("/dashboard");
  return { ok: true };
}
