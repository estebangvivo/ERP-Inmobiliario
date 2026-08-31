"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ORG_MODULE_KEYS, type AppModuleKey } from "@/features/auth/lib/modules";
import { requireOrgAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/server/actions/users";

export type WhatsAppSettingsActionResult = ActionResult & { message?: string };

const orgSettingsSchema = z.object({
  accessToken: z.string().optional(),
  verifyToken: z.string().optional(),
  waPhoneNumberId: z.string().trim().max(64).optional().nullable(),
  waDisplayPhone: z.string().trim().max(40).optional().nullable(),
  routingMode: z.enum(["MANUAL", "ROUND_ROBIN", "LEAST_BUSY"]),
  graphApiVersion: z.string().trim().max(16).optional(),
});

const agentRowSchema = z.object({
  memberId: z.string().min(1),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(100),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  hourStart: z.number().int().min(0).max(23),
  hourEnd: z.number().int().min(1).max(24),
});

const agentsPayloadSchema = z.object({
  agents: z.array(agentRowSchema),
});

function toggleWhatsAppModule(
  modules: string[],
  enabled: boolean,
): AppModuleKey[] {
  const set = new Set(
    modules.filter((m): m is AppModuleKey =>
      ORG_MODULE_KEYS.includes(m as AppModuleKey),
    ),
  );
  if (enabled) set.add("whatsapp");
  else set.delete("whatsapp");
  return [...set];
}

export async function updateWhatsAppOrgSettingsAction(
  input: z.infer<typeof orgSettingsSchema>,
): Promise<WhatsAppSettingsActionResult> {
  try {
    const session = await requireOrgAdmin();
    const parsed = orgSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos de configuración inválidos." };
    }

    const waPhoneNumberId = parsed.data.waPhoneNumberId?.trim() || null;
    const waDisplayPhone = parsed.data.waDisplayPhone?.trim() || null;
    const accessToken = parsed.data.accessToken?.trim();
    const verifyToken = parsed.data.verifyToken?.trim();

    if (waPhoneNumberId) {
      const taken = await prisma.organization.findFirst({
        where: {
          waPhoneNumberId,
          NOT: { id: session.organizationId },
        },
        select: { id: true },
      });
      if (taken) {
        return {
          ok: false,
          error: "Ese Phone Number ID ya está asignado a otra inmobiliaria.",
        };
      }
    }

    const data: Record<string, unknown> = {
      waPhoneNumberId,
      waDisplayPhone,
      waRoutingMode: parsed.data.routingMode,
      waGraphApiVersion: parsed.data.graphApiVersion?.trim() || "v21.0",
    };
    if (accessToken) data.waAccessToken = accessToken;
    if (verifyToken) data.waVerifyToken = verifyToken;

    try {
      await prisma.organization.update({
        where: { id: session.organizationId },
        data,
      });
    } catch {
      await prisma.organization.update({
        where: { id: session.organizationId },
        data: { waPhoneNumberId },
      });
      return {
        ok: false,
        error:
          "Guardá la configuración después de reiniciar el servidor (Prisma desactualizado).",
      };
    }

    revalidatePath("/whatsapp");
    revalidatePath("/whatsapp/configuracion");
    return { ok: true, message: "Conexión de WhatsApp guardada." };
  } catch {
    return { ok: false, error: "No se pudo guardar la configuración." };
  }
}

export async function updateWhatsAppAgentsSettingsAction(
  input: z.infer<typeof agentsPayloadSchema>,
): Promise<WhatsAppSettingsActionResult> {
  try {
    const session = await requireOrgAdmin();
    const parsed = agentsPayloadSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Datos de agentes inválidos." };
    }

    for (const row of parsed.data.agents) {
      if (row.hourEnd <= row.hourStart) {
        return {
          ok: false,
          error: "La hora de fin debe ser posterior a la de inicio en cada agente.",
        };
      }
    }

    const memberIds = parsed.data.agents.map((a) => a.memberId);
    const members = await prisma.organizationMember.findMany({
      where: {
        organizationId: session.organizationId,
        id: { in: memberIds },
        role: "AGENT",
      },
      select: { id: true, allowedModules: true },
    });

    if (members.length !== memberIds.length) {
      return { ok: false, error: "Uno o más agentes no son válidos." };
    }

    const memberById = new Map(members.map((m) => [m.id, m]));

    await prisma.$transaction(
      parsed.data.agents.map((row) => {
        const member = memberById.get(row.memberId)!;
        return prisma.organizationMember.update({
          where: { id: row.memberId },
          data: {
            allowedModules: toggleWhatsAppModule(
              member.allowedModules,
              row.enabled,
            ),
          },
        });
      }),
    );

    try {
      await prisma.$transaction(
        parsed.data.agents.map((row) =>
          prisma.organizationMember.update({
            where: { id: row.memberId },
            data: {
              whatsappEnabled: row.enabled,
              whatsappPriority: row.priority,
              whatsappWeekdays: [...new Set(row.weekdays)].sort((a, b) => a - b),
              whatsappHourStart: row.hourStart,
              whatsappHourEnd: row.hourEnd,
            },
          }),
        ),
      );
    } catch {
      /* Horarios extendidos opcionales */
    }

    revalidatePath("/whatsapp");
    revalidatePath("/whatsapp/configuracion");
    return { ok: true, message: "Agentes de WhatsApp actualizados." };
  } catch {
    return { ok: false, error: "No se pudieron guardar los agentes." };
  }
}
