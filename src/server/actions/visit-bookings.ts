"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { VisitBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/session";
import {
  formatArtDisplay,
  generateVisitSlots,
  isValidVisitSlot,
  type VisitSlot,
} from "@/lib/visit-slots";
import { publicPropertiesPath } from "@/lib/public-org";

export type VisitActionResult =
  | {
      ok: true;
      bookingId?: string;
      startsAt?: string;
      message?: string;
    }
  | { ok: false; error: string };

const bookSchema = z.object({
  propertyId: z.string().min(1),
  startsAt: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
});

export type AvailableDay = {
  dateKey: string;
  label: string;
  slots: Array<{ startsAt: string; timeLabel: string }>;
};

export async function getAvailableVisitDays(
  propertyId: string,
): Promise<AvailableDay[]> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, organizationId: true },
  });
  if (!property?.organizationId) return [];

  const candidates = generateVisitSlots(new Date());
  if (candidates.length === 0) return [];

  const from = candidates[0]!.startsAt;
  const to = candidates[candidates.length - 1]!.endsAt;

  const taken = await prisma.propertyVisitBooking.findMany({
    where: {
      propertyId,
      status: "RESERVED",
      startsAt: { gte: from, lte: to },
    },
    select: { startsAt: true },
  });
  const takenKeys = new Set(taken.map((t) => t.startsAt.toISOString()));

  const free = candidates.filter(
    (s) => !takenKeys.has(s.startsAt.toISOString()),
  );

  const byDay = new Map<string, VisitSlot[]>();
  for (const slot of free) {
    const list = byDay.get(slot.dateKey) ?? [];
    list.push(slot);
    byDay.set(slot.dateKey, list);
  }

  return [...byDay.entries()].map(([dateKey, slots]) => {
    const sample = slots[0]!.startsAt;
    const label = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(sample);
    return {
      dateKey,
      label,
      slots: slots.map((s) => ({
        startsAt: s.startsAt.toISOString(),
        timeLabel: s.timeLabel,
      })),
    };
  });
}

export async function bookPropertyVisitAction(
  _prev: VisitActionResult | null,
  formData: FormData,
): Promise<VisitActionResult> {
  const parsed = bookSchema.safeParse({
    propertyId: formData.get("propertyId"),
    startsAt: formData.get("startsAt"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime()) || !isValidVisitSlot(startsAt)) {
    return {
      ok: false,
      error: "Ese horario no está disponible (lun–vie 8 a 16 hs).",
    };
  }

  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

  const property = await prisma.property.findUnique({
    where: { id: parsed.data.propertyId },
    select: {
      id: true,
      title: true,
      organizationId: true,
      organization: { select: { slug: true } },
      status: true,
      slug: true,
    },
  });

  if (!property?.organizationId) {
    return { ok: false, error: "Propiedad no encontrada." };
  }

  const existing = await prisma.propertyVisitBooking.findFirst({
    where: {
      propertyId: property.id,
      startsAt,
      status: "RESERVED",
    },
  });
  if (existing) {
    return {
      ok: false,
      error: "Ese turno ya fue reservado. Elegí otro horario.",
    };
  }

  const display = formatArtDisplay(startsAt);
  const message = `Reserva de visita para “${property.title}” el ${display}.`;

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          organizationId: property.organizationId!,
          propertyId: property.id,
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone ?? null,
          message,
          status: "NEW",
          source: "visit_booking",
        },
      });

      return tx.propertyVisitBooking.create({
        data: {
          organizationId: property.organizationId!,
          propertyId: property.id,
          startsAt,
          endsAt,
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone ?? null,
          status: "RESERVED",
          leadId: lead.id,
        },
      });
    });

    if (property.organization?.slug) {
      revalidatePath(publicPropertiesPath(property.organization.slug));
      revalidatePath(
        `${publicPropertiesPath(property.organization.slug)}/${property.slug}`,
      );
    }
    revalidatePath("/visitas");
    revalidatePath("/leads");

    return {
      ok: true,
      bookingId: booking.id,
      startsAt: booking.startsAt.toISOString(),
      message: `Visita reservada para el ${display}.`,
    };
  } catch (error) {
    console.error("bookPropertyVisitAction", error);
    return {
      ok: false,
      error: "No se pudo reservar. El horario puede haber sido tomado.",
    };
  }
}

export type VisitBookingRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  name: string;
  email: string;
  phone: string | null;
  status: VisitBookingStatus;
  assigneeId: string | null;
  property: { id: string; title: string; slug: string };
  assignee: { id: string; name: string } | null;
};

export type VisitStaffOption = {
  id: string;
  name: string;
  role: string;
};

export async function listVisitStaffOptions(): Promise<VisitStaffOption[]> {
  const session = await requireModule("consultas");
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: session.organizationId,
      role: { in: ["ADMIN", "AGENT"] },
      user: { isActive: true },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    role: m.role,
  }));
}

export async function listOrganizationVisitBookings(): Promise<
  VisitBookingRow[]
> {
  const session = await requireModule("consultas");
  return prisma.propertyVisitBooking.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { startsAt: "asc" },
    include: {
      property: { select: { id: true, title: true, slug: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
}

export async function updateVisitBookingStatusAction(
  id: string,
  status: VisitBookingStatus,
): Promise<VisitActionResult> {
  const session = await requireModule("consultas");
  const booking = await prisma.propertyVisitBooking.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!booking) return { ok: false, error: "Reserva no encontrada." };

  await prisma.propertyVisitBooking.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/visitas");
  return { ok: true };
}

export async function assignVisitBookingAction(
  id: string,
  assigneeId: string | null,
): Promise<VisitActionResult> {
  const session = await requireModule("consultas");
  const booking = await prisma.propertyVisitBooking.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!booking) return { ok: false, error: "Reserva no encontrada." };

  if (assigneeId) {
    const member = await prisma.organizationMember.findFirst({
      where: {
        organizationId: session.organizationId,
        userId: assigneeId,
        role: { in: ["ADMIN", "AGENT"] },
        user: { isActive: true },
      },
    });
    if (!member) {
      return { ok: false, error: "Ese usuario no puede asignarse a visitas." };
    }
  }

  await prisma.propertyVisitBooking.update({
    where: { id },
    data: { assigneeId },
  });
  revalidatePath("/visitas");
  return { ok: true };
}