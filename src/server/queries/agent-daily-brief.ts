import { prisma } from "@/lib/prisma";
import { formatArtTimeLabel } from "@/lib/visit-slots";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@prisma/client";
import {
  buildSummaryLine,
  buildTasks,
  buildTimelineToday,
  type AgentBriefBill,
  type AgentBriefContract,
  type AgentBriefLead,
  type AgentBriefVisit,
  type AgentBriefWorkOrder,
  type AgentDailyBrief,
} from "@/lib/agent-daily-brief-shared";

export type {
  AgentBriefVisit,
  AgentBriefLead,
  AgentBriefBill,
  AgentBriefContract,
  AgentBriefWorkOrder,
  AgentDailyTask,
  AgentTimelineKind,
  AgentTimelineEntry,
  AgentScope,
  AgentDailyBrief,
} from "@/lib/agent-daily-brief-shared";

export { filterAgentBrief } from "@/lib/agent-daily-brief-shared";

const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
const MAX_ITEMS = 8;
const CONTRACT_SOON_DAYS = 30;

function artNow() {
  return new Date(Date.now() + ART_OFFSET_MS);
}

function artDateKeyFromOffset(dayOffset: number): string {
  const shifted = artNow();
  const base = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + dayOffset,
  );
  const d = new Date(base);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function startOfArtDayUtc(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 3, 0, 0));
}

function endOfArtDayUtc(dateKey: string) {
  return new Date(startOfArtDayUtc(dateKey).getTime() + 24 * 60 * 60 * 1000);
}

function artGreeting(): string {
  const hour = artNow().getUTCHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export async function getAgentDailyBrief(
  organizationId: string,
  agentName: string,
): Promise<AgentDailyBrief> {
  const todayKey = artDateKeyFromOffset(0);
  const tomorrowKey = artDateKeyFromOffset(1);
  const todayStart = startOfArtDayUtc(todayKey);
  const tomorrowEnd = endOfArtDayUtc(tomorrowKey);
  const contractSoonEnd = new Date(todayStart);
  contractSoonEnd.setUTCDate(contractSoonEnd.getUTCDate() + CONTRACT_SOON_DAYS);

  const visitSelect = {
    id: true,
    startsAt: true,
    name: true,
    email: true,
    phone: true,
    assigneeId: true,
    property: { select: { title: true } },
    assignee: { select: { name: true } },
  } as const;

  const [
    organization,
    visitsTodayRaw,
    visitsTomorrowRaw,
    pendingLeadsRaw,
    overdueBillsRaw,
    expiringContractsRaw,
    openWorkOrdersRaw,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    prisma.propertyVisitBooking.findMany({
      where: {
        organizationId,
        status: "RESERVED",
        startsAt: { gte: todayStart, lt: endOfArtDayUtc(todayKey) },
      },
      select: visitSelect,
      orderBy: { startsAt: "asc" },
      take: MAX_ITEMS,
    }),
    prisma.propertyVisitBooking.findMany({
      where: {
        organizationId,
        status: "RESERVED",
        startsAt: {
          gte: startOfArtDayUtc(tomorrowKey),
          lt: tomorrowEnd,
        },
      },
      select: visitSelect,
      orderBy: { startsAt: "asc" },
      take: MAX_ITEMS,
    }),
    prisma.lead.findMany({
      where: { organizationId, status: "NEW" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        assigneeId: true,
        message: true,
        createdAt: true,
        property: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_ITEMS,
    }),
    prisma.tenantBill.findMany({
      where: {
        contract: { organizationId },
        status: "OVERDUE",
      },
      select: {
        id: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        currency: true,
        contract: {
          select: { code: true, property: { select: { title: true } } },
        },
      },
      orderBy: { dueDate: "asc" },
      take: MAX_ITEMS,
    }),
    prisma.contract.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        endDate: { gte: todayStart, lte: contractSoonEnd },
      },
      select: {
        id: true,
        code: true,
        endDate: true,
        property: { select: { title: true } },
      },
      orderBy: { endDate: "asc" },
      take: MAX_ITEMS,
    }),
    prisma.workOrder.findMany({
      where: {
        organizationId,
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        property: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_ITEMS,
    }),
  ]);

  const mapVisit = (v: (typeof visitsTodayRaw)[number]): AgentBriefVisit => ({
    id: v.id,
    startsAt: v.startsAt.toISOString(),
    timeLabel: formatArtTimeLabel(v.startsAt),
    name: v.name,
    email: v.email,
    phone: v.phone,
    propertyTitle: v.property.title,
    assigneeId: v.assigneeId,
    assigneeName: v.assignee?.name ?? null,
    unassigned: !v.assigneeId,
  });

  const visitsToday = visitsTodayRaw.map(mapVisit);
  const visitsTomorrow = visitsTomorrowRaw.map(mapVisit);

  const pendingLeads: AgentBriefLead[] = pendingLeadsRaw.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    assigneeId: l.assigneeId,
    propertyTitle: l.property?.title ?? null,
    createdAt: l.createdAt.toISOString(),
    messagePreview:
      l.message.length > 80 ? `${l.message.slice(0, 80)}…` : l.message,
  }));

  const overdueBills: AgentBriefBill[] = overdueBillsRaw.map((b) => ({
    id: b.id,
    propertyTitle: b.contract.property.title,
    contractCode: b.contract.code,
    balance: String(Number(b.totalAmount) - Number(b.paidAmount)),
    currency: b.currency,
    dueDate: b.dueDate.toISOString(),
    status: b.status,
  }));

  const expiringContracts: AgentBriefContract[] = expiringContractsRaw.map(
    (c) => {
      const daysLeft = Math.max(
        0,
        Math.ceil(
          (c.endDate.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000),
        ),
      );
      return {
        id: c.id,
        code: c.code,
        propertyTitle: c.property.title,
        endDate: c.endDate.toISOString(),
        daysLeft,
      };
    },
  );

  const openWorkOrders: AgentBriefWorkOrder[] = openWorkOrdersRaw.map((w) => ({
    id: w.id,
    title: w.title,
    propertyTitle: w.property.title,
    status: w.status,
  }));

  const tasks = buildTasks({
    visitsToday,
    pendingLeads,
    overdueBills,
    expiringContracts,
    openWorkOrders,
  });

  const summaryLine = buildSummaryLine({
    visitsToday: visitsToday.length,
    unassignedVisits: visitsToday.filter((v) => v.unassigned).length,
    pendingLeads: pendingLeads.length,
    overdueBills: overdueBills.length,
    expiringContracts: expiringContracts.length,
    openWorkOrders: openWorkOrders.length,
  });

  const timelineToday = buildTimelineToday({
    visitsToday,
    pendingLeads,
    overdueBills,
    openWorkOrders,
    expiringContracts,
    todayStartMs: todayStart.getTime(),
  });

  return {
    greeting: `${artGreeting()}, ${agentName.split(" ")[0] ?? agentName}`,
    summaryLine,
    organizationName: organization?.name ?? "la inmobiliaria",
    visitsToday,
    visitsTomorrow,
    pendingLeads,
    overdueBills,
    expiringContracts,
    openWorkOrders,
    tasks,
    timelineToday,
  };
}
