"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { VisitBookingStatus } from "@prisma/client";
import { listInamoviblesForYears, persistEnabledHolidays } from "@/lib/ar-holidays";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/session";
import {
  DEFAULT_VISIT_SCHEDULE,
  effectiveEnabledHolidays,
  formatArtDisplay,
  formatScheduleSummary,
  generateVisitSlots,
  isValidVisitSlot,
  normalizeVisitSchedule,
  scheduleFromOrganization,
  type VisitScheduleConfig,
  type VisitSlot,
} from "@/lib/visit-slots";
import { publicPropertiesPath } from "@/lib/public-org";

const ORG_SCHEDULE_SELECT = {
  visitWeekdays: true,
  visitHourStart: true,
  visitHourEnd: true,
  visitClosedDates: true,
  visitEnabledHolidays: true,
  slug: true,
} as const;

async function loadOrgSchedule(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: ORG_SCHEDULE_SELECT,
  });
  if (!org) return null;
  return {
    org,
    schedule: scheduleFromOrganization(org),
  };
}

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

export type VisitBookableProperty = {
  id: string;
  title: string;
};

export async function listVisitBookableProperties(): Promise<
  VisitBookableProperty[]
> {
  const session = await requireModule("consultas");
  return prisma.property.findMany({
    where: {
      organizationId: session.organizationId,
      status: { in: ["AVAILABLE", "RESERVED"] },
      publishedAt: { not: null },
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

export async function getAvailableVisitDays(
  propertyId: string,
): Promise<AvailableDay[]> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      organizationId: true,
      organization: { select: ORG_SCHEDULE_SELECT },
    },
  });
  if (!property?.organizationId || !property.organization) return [];

  const schedule = scheduleFromOrganization(property.organization);
  const candidates = generateVisitSlots(new Date(), undefined, schedule);
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

export async function bookPropertyVisit(input: {
  propertyId: string;
  startsAt: string;
  name: string;
  email: string;
  phone?: string;
}): Promise<VisitActionResult> {
  const parsed = bookSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const property = await prisma.property.findUnique({
    where: { id: parsed.data.propertyId },
    select: {
      id: true,
      title: true,
      organizationId: true,
      organization: { select: ORG_SCHEDULE_SELECT },
      status: true,
      slug: true,
    },
  });

  if (!property?.organizationId || !property.organization) {
    return { ok: false, error: "Propiedad no encontrada." };
  }

  const startsAt = new Date(parsed.data.startsAt);
  const schedule = scheduleFromOrganization(property.organization);
  if (Number.isNaN(startsAt.getTime()) || !isValidVisitSlot(startsAt, new Date(), schedule)) {
    return {
      ok: false,
      error: `Ese horario no está disponible (${formatScheduleSummary(schedule)}).`,
    };
  }

  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

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
    revalidatePath("/agenda");
    revalidatePath("/leads");

    return {
      ok: true,
      bookingId: booking.id,
      startsAt: booking.startsAt.toISOString(),
      message: `Visita reservada para el ${display}.`,
    };
  } catch (error) {
    console.error("bookPropertyVisit", error);
    return {
      ok: false,
      error: "No se pudo reservar. El horario puede haber sido tomado.",
    };
  }
}

export async function bookPropertyVisitAction(
  _prev: VisitActionResult | null,
  formData: FormData,
): Promise<VisitActionResult> {
  return bookPropertyVisit({
    propertyId: String(formData.get("propertyId") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: formData.get("phone")
      ? String(formData.get("phone"))
      : undefined,
  });
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
      user: {
        isActive: true,
        ...excludePlatformSuperadminFromUser(),
      },
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
        user: {
          isActive: true,
          ...excludePlatformSuperadminFromUser(),
        },
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

export type VisitScheduleSettingsPayload = {
  schedule: VisitScheduleConfig;
  /** MM-DD efectivamente marcados (para checkboxes). */
  enabledHolidayMonthDays: string[];
  summary: string;
  canEdit: boolean;
  holidays: Array<{
    dateKey: string;
    monthDay: string;
    name: string;
    year: number;
  }>;
};

export async function getVisitScheduleSettings(): Promise<VisitScheduleSettingsPayload> {
  const session = await requireModule("consultas");
  const loaded = await loadOrgSchedule(session.organizationId);
  const schedule = loaded?.schedule ?? DEFAULT_VISIT_SCHEDULE;
  const now = new Date();
  const year = now.getFullYear();
  const holidays = listInamoviblesForYears([year, year + 1]);

  return {
    schedule,
    enabledHolidayMonthDays: effectiveEnabledHolidays(schedule),
    summary: formatScheduleSummary(schedule),
    canEdit: session.organizationRole === "ADMIN",
    holidays,
  };
}

const scheduleUpdateSchema = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  hourStart: z.number().int().min(0).max(23),
  hourEnd: z.number().int().min(1).max(24),
  closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  enabledHolidays: z.array(z.string().regex(/^\d{2}-\d{2}$/)),
});

export async function updateVisitScheduleAction(
  input: z.infer<typeof scheduleUpdateSchema>,
): Promise<VisitActionResult> {
  const session = await requireModule("consultas");
  if (session.organizationRole !== "ADMIN") {
    return { ok: false, error: "Solo un administrador puede cambiar la agenda." };
  }

  const parsed = scheduleUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  if (parsed.data.hourEnd <= parsed.data.hourStart) {
    return { ok: false, error: "La hora de fin debe ser posterior a la de inicio." };
  }

  const schedule = normalizeVisitSchedule({
    weekdays: parsed.data.weekdays,
    hourStart: parsed.data.hourStart,
    hourEnd: parsed.data.hourEnd,
    closedDates: [...new Set(parsed.data.closedDates)].sort(),
    enabledHolidays: persistEnabledHolidays(parsed.data.enabledHolidays),
  });

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: {
      visitWeekdays: schedule.weekdays,
      visitHourStart: schedule.hourStart,
      visitHourEnd: schedule.hourEnd,
      visitClosedDates: schedule.closedDates,
      visitEnabledHolidays: schedule.enabledHolidays,
    },
  });

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { slug: true },
  });
  revalidatePath("/visitas");
  if (org?.slug) {
    revalidatePath(publicPropertiesPath(org.slug));
    revalidatePath(`${publicPropertiesPath(org.slug)}/propiedades`);
  }

  return {
    ok: true,
    message: `Agenda actualizada (${formatScheduleSummary(schedule)}).`,
  };
}