import { formatMoney } from "@/lib/money";
import type { Currency } from "@prisma/client";

export type AgentBriefVisit = {
  id: string;
  startsAt: string;
  timeLabel: string;
  name: string;
  phone: string | null;
  email: string;
  propertyTitle: string;
  assigneeId: string | null;
  assigneeName: string | null;
  unassigned: boolean;
};

export type AgentBriefLead = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  propertyTitle: string | null;
  assigneeId: string | null;
  createdAt: string;
  messagePreview: string;
};

export type AgentBriefBill = {
  id: string;
  propertyTitle: string;
  contractCode: string;
  balance: string;
  currency: string;
  dueDate: string;
  status: string;
};

export type AgentBriefContract = {
  id: string;
  code: string;
  propertyTitle: string;
  endDate: string;
  daysLeft: number;
};

export type AgentBriefWorkOrder = {
  id: string;
  title: string;
  propertyTitle: string;
  status: string;
};

export type AgentDailyTask = {
  id: string;
  priority: number;
  label: string;
  detail: string;
  href: string;
};

export type AgentTimelineKind =
  | "visit"
  | "lead"
  | "bill"
  | "work_order"
  | "contract";

export type AgentTimelineEntry = {
  id: string;
  kind: AgentTimelineKind;
  timeLabel: string | null;
  sortAt: number;
  title: string;
  subtitle: string;
  href: string;
  refId: string;
};

export type AgentScope = "mine" | "all";

export type AgentDailyBrief = {
  greeting: string;
  summaryLine: string;
  organizationName: string;
  visitsToday: AgentBriefVisit[];
  visitsTomorrow: AgentBriefVisit[];
  pendingLeads: AgentBriefLead[];
  overdueBills: AgentBriefBill[];
  expiringContracts: AgentBriefContract[];
  openWorkOrders: AgentBriefWorkOrder[];
  tasks: AgentDailyTask[];
  timelineToday: AgentTimelineEntry[];
};

const MAX_TASKS = 12;

function buildSummaryLine(parts: {
  visitsToday: number;
  unassignedVisits: number;
  pendingLeads: number;
  overdueBills: number;
  expiringContracts: number;
  openWorkOrders: number;
}): string {
  const bits: string[] = [];
  if (parts.visitsToday > 0) {
    bits.push(
      `${parts.visitsToday} visita${parts.visitsToday === 1 ? "" : "s"} hoy`,
    );
  }
  if (parts.unassignedVisits > 0) {
    bits.push(`${parts.unassignedVisits} sin agente asignado`);
  }
  if (parts.pendingLeads > 0) {
    bits.push(
      `${parts.pendingLeads} consulta${parts.pendingLeads === 1 ? "" : "s"} sin responder`,
    );
  }
  if (parts.overdueBills > 0) {
    bits.push(
      `${parts.overdueBills} cuota${parts.overdueBills === 1 ? "" : "s"} en mora`,
    );
  }
  if (parts.expiringContracts > 0) {
    bits.push(
      `${parts.expiringContracts} contrato${parts.expiringContracts === 1 ? "" : "s"} por vencer`,
    );
  }
  if (parts.openWorkOrders > 0) {
    bits.push(
      `${parts.openWorkOrders} reclamo${parts.openWorkOrders === 1 ? "" : "s"} abierto${parts.openWorkOrders === 1 ? "" : "s"}`,
    );
  }
  if (bits.length === 0) {
    return "No hay pendientes urgentes para hoy. Revisá la agenda por si aparece algo nuevo.";
  }
  return bits.join(" · ");
}

export function buildTimelineToday(input: {
  visitsToday: AgentBriefVisit[];
  pendingLeads: AgentBriefLead[];
  overdueBills: AgentBriefBill[];
  openWorkOrders: AgentBriefWorkOrder[];
  expiringContracts: AgentBriefContract[];
  todayStartMs: number;
}): AgentTimelineEntry[] {
  const entries: AgentTimelineEntry[] = [];
  let flexBase =
    input.visitsToday.length > 0
      ? Math.max(
          ...input.visitsToday.map((v) => new Date(v.startsAt).getTime()),
        ) + 60_000
      : input.todayStartMs + 12 * 60 * 60 * 1000;

  for (const v of input.visitsToday) {
    entries.push({
      id: `timeline-visit-${v.id}`,
      kind: "visit",
      timeLabel: v.timeLabel,
      sortAt: new Date(v.startsAt).getTime(),
      title: v.propertyTitle,
      subtitle: v.name,
      href: "/visitas",
      refId: v.id,
    });
  }

  for (const l of input.pendingLeads) {
    flexBase += 60_000;
    entries.push({
      id: `timeline-lead-${l.id}`,
      kind: "lead",
      timeLabel: null,
      sortAt: flexBase,
      title: `Responder · ${l.name}`,
      subtitle: l.propertyTitle ?? l.messagePreview,
      href: "/leads?status=NEW",
      refId: l.id,
    });
  }

  for (const b of input.overdueBills) {
    flexBase += 60_000;
    entries.push({
      id: `timeline-bill-${b.id}`,
      kind: "bill",
      timeLabel: null,
      sortAt: flexBase,
      title: `Cobrar mora · ${b.propertyTitle}`,
      subtitle: `${b.contractCode} · ${formatMoney(b.balance, b.currency as Currency)}`,
      href: `/cobros/${b.id}`,
      refId: b.id,
    });
  }

  for (const w of input.openWorkOrders) {
    flexBase += 60_000;
    entries.push({
      id: `timeline-wo-${w.id}`,
      kind: "work_order",
      timeLabel: null,
      sortAt: flexBase,
      title: w.title,
      subtitle: w.propertyTitle,
      href: `/mantenimiento/${w.id}`,
      refId: w.id,
    });
  }

  for (const c of input.expiringContracts) {
    flexBase += 60_000;
    entries.push({
      id: `timeline-contract-${c.id}`,
      kind: "contract",
      timeLabel: null,
      sortAt: flexBase,
      title: `Contrato por vencer · ${c.propertyTitle}`,
      subtitle: `${c.code} · ${c.daysLeft} días`,
      href: `/contratos/${c.id}`,
      refId: c.id,
    });
  }

  return entries.sort(
    (a, b) => a.sortAt - b.sortAt || a.title.localeCompare(b.title, "es"),
  );
}

function buildTasks(input: {
  visitsToday: AgentBriefVisit[];
  pendingLeads: AgentBriefLead[];
  overdueBills: AgentBriefBill[];
  expiringContracts: AgentBriefContract[];
  openWorkOrders: AgentBriefWorkOrder[];
}): AgentDailyTask[] {
  const tasks: AgentDailyTask[] = [];
  const nowMs = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;

  for (const v of input.visitsToday) {
    const startsMs = new Date(v.startsAt).getTime();
    const soon = startsMs - nowMs <= twoHours && startsMs >= nowMs;
    tasks.push({
      id: `visit-${v.id}`,
      priority: v.unassigned ? 1 : soon ? 2 : 3,
      label: v.unassigned
        ? `Asignar visita ${v.timeLabel} · ${v.propertyTitle}`
        : `Visita ${v.timeLabel} · ${v.propertyTitle}`,
      detail: v.name,
      href: "/visitas",
    });
  }

  for (const l of input.pendingLeads) {
    tasks.push({
      id: `lead-${l.id}`,
      priority: 4,
      label: `Responder consulta · ${l.name}`,
      detail: l.propertyTitle ?? l.messagePreview,
      href: "/leads",
    });
  }

  for (const b of input.overdueBills) {
    tasks.push({
      id: `bill-${b.id}`,
      priority: 5,
      label: `Cobrar mora · ${b.propertyTitle}`,
      detail: `${b.contractCode} · ${formatMoney(b.balance, b.currency as Currency)}`,
      href: `/cobros/${b.id}`,
    });
  }

  for (const c of input.expiringContracts) {
    tasks.push({
      id: `contract-${c.id}`,
      priority: c.daysLeft <= 7 ? 6 : 7,
      label: `Contrato vence en ${c.daysLeft} días · ${c.propertyTitle}`,
      detail: c.code,
      href: `/contratos/${c.id}`,
    });
  }

  for (const w of input.openWorkOrders) {
    tasks.push({
      id: `wo-${w.id}`,
      priority: 8,
      label: `Reclamo · ${w.title}`,
      detail: w.propertyTitle,
      href: `/mantenimiento/${w.id}`,
    });
  }

  return tasks
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label, "es"))
    .slice(0, MAX_TASKS);
}

export function filterAgentBrief(
  brief: AgentDailyBrief,
  userId: string,
  scope: AgentScope,
): AgentDailyBrief {
  if (scope === "all") return brief;

  const visitsToday = brief.visitsToday.filter((v) => v.assigneeId === userId);
  const visitsTomorrow = brief.visitsTomorrow.filter(
    (v) => v.assigneeId === userId,
  );
  const pendingLeads = brief.pendingLeads.filter(
    (l) => l.assigneeId === userId,
  );

  const tasks = buildTasks({
    visitsToday,
    pendingLeads,
    overdueBills: [],
    expiringContracts: [],
    openWorkOrders: [],
  });

  const summaryLine = buildSummaryLine({
    visitsToday: visitsToday.length,
    unassignedVisits: 0,
    pendingLeads: pendingLeads.length,
    overdueBills: 0,
    expiringContracts: 0,
    openWorkOrders: 0,
  });

  const todayStartMs = visitsToday[0]
    ? new Date(visitsToday[0].startsAt).getTime() - 12 * 60 * 60 * 1000
    : Date.now();

  const timelineToday = buildTimelineToday({
    visitsToday,
    pendingLeads,
    overdueBills: [],
    openWorkOrders: [],
    expiringContracts: [],
    todayStartMs,
  });

  return {
    ...brief,
    summaryLine,
    visitsToday,
    visitsTomorrow,
    pendingLeads,
    overdueBills: [],
    expiringContracts: [],
    openWorkOrders: [],
    tasks,
    timelineToday,
  };
}

export { buildSummaryLine, buildTasks };
