"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  MessageSquare,
  Sparkles,
  UserPlus,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  buildLeadReplyMessage,
  buildMoraReminderMessage,
  buildVisitConfirmMessage,
} from "@/lib/agent-message-templates";
import {
  assignLeadToMeAction,
  claimUnassignedVisitAction,
  markLeadContactedAction,
} from "@/server/actions/agent-daily";
import {
  filterAgentBrief,
  type AgentBriefLead,
  type AgentBriefVisit,
  type AgentDailyBrief,
  type AgentScope,
  type AgentTimelineEntry,
} from "@/lib/agent-daily-brief-shared";

type StatChip = {
  label: string;
  count: number;
  href: string;
  tone: "primary" | "warning" | "danger" | "muted";
};

type GroupConfig = {
  id: string;
  title: string;
  description: string;
  preview: string;
  href: string;
  icon: LucideIcon;
  tone: "sky" | "amber" | "rose" | "violet" | "orange" | "teal";
  count: number;
  items: Array<{
    id: string;
    href: string;
    title: string;
    subtitle: string;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
  }>;
};

const TONE_STYLES = {
  sky: {
    chip: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
    border: "border-sky-200/80 dark:border-sky-900/50",
    header: "bg-sky-500/8",
    icon: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  amber: {
    chip: "bg-amber-500/10 text-amber-900 dark:text-amber-200",
    border: "border-amber-200/80 dark:border-amber-900/50",
    header: "bg-amber-500/8",
    icon: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  rose: {
    chip: "bg-rose-500/10 text-rose-900 dark:text-rose-200",
    border: "border-rose-200/80 dark:border-rose-900/50",
    header: "bg-rose-500/8",
    icon: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  violet: {
    chip: "bg-violet-500/10 text-violet-900 dark:text-violet-200",
    border: "border-violet-200/80 dark:border-violet-900/50",
    header: "bg-violet-500/8",
    icon: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  orange: {
    chip: "bg-orange-500/10 text-orange-900 dark:text-orange-200",
    border: "border-orange-200/80 dark:border-orange-900/50",
    header: "bg-orange-500/8",
    icon: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  teal: {
    chip: "bg-teal-500/10 text-teal-900 dark:text-teal-200",
    border: "border-teal-200/80 dark:border-teal-900/50",
    header: "bg-teal-500/8",
    icon: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
    dot: "bg-teal-500",
  },
} as const;

const TIMELINE_KIND_TONE: Record<
  AgentTimelineEntry["kind"],
  keyof typeof TONE_STYLES
> = {
  visit: "sky",
  lead: "amber",
  bill: "rose",
  work_order: "orange",
  contract: "violet",
};

const COLLAPSE_WHEN_TOTAL_ABOVE = 6;
const MAX_ITEMS_BEFORE_SCROLL = 4;

function totalPendingCount(
  timeline: number,
  groups: GroupConfig[],
): number {
  return timeline + groups.reduce((n, g) => n + g.count, 0);
}

function defaultExpandedMap(
  timelineCount: number,
  groups: GroupConfig[],
): Record<string, boolean> {
  const total = totalPendingCount(timelineCount, groups);
  const many = total > COLLAPSE_WHEN_TOTAL_ABOVE;
  const map: Record<string, boolean> = {};

  if (timelineCount > 0) {
    map.timeline = !many;
  }

  for (const group of groups) {
    if (!many) {
      map[group.id] = true;
      continue;
    }
    map[group.id] =
      group.id === "visits-today" ||
      (group.id === "leads" && group.count <= 3);
  }

  return map;
}

export function AgentDailyAssistant({
  brief,
  userId,
}: {
  brief: AgentDailyBrief;
  userId: string;
}) {
  const [scope, setScope] = useState<AgentScope>("mine");
  const filtered = useMemo(
    () => filterAgentBrief(brief, userId, scope),
    [brief, userId, scope],
  );
  const groups = buildGroups(filtered, brief, userId, scope);
  const stats = buildStats(filtered);
  const totalPending = stats.reduce((n, s) => n + s.count, 0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    defaultExpandedMap(filtered.timelineToday.length, groups),
  );

  useEffect(() => {
    setExpanded(defaultExpandedMap(filtered.timelineToday.length, groups));
  }, [scope]);

  const sectionKeys = useMemo(() => {
    const keys = groups.map((g) => g.id);
    if (filtered.timelineToday.length > 0) keys.unshift("timeline");
    return keys;
  }, [groups, filtered.timelineToday.length]);

  const allExpanded =
    sectionKeys.length > 0 && sectionKeys.every((key) => expanded[key] !== false);
  const allCollapsed =
    sectionKeys.length > 0 && sectionKeys.every((key) => expanded[key] === false);

  function toggleSection(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function expandAll() {
    setExpanded(Object.fromEntries(sectionKeys.map((key) => [key, true])));
  }

  function collapseAll() {
    setExpanded(Object.fromEntries(sectionKeys.map((key) => [key, false])));
  }

  return (
    <Card className="overflow-hidden border-[var(--primary)]/15 shadow-sm">
      <CardHeader className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--primary)]/5 via-[var(--card)] to-[var(--muted)]/20 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--primary)]/10">
                <Sparkles className="size-5 text-[var(--primary)]" />
              </span>
              Tu día
            </CardTitle>
            <CardDescription className="text-base font-medium text-[var(--foreground)]">
              {brief.greeting}
            </CardDescription>
            <p className="max-w-2xl text-sm text-[var(--muted-foreground)]">
              {totalPending > 0
                ? filtered.summaryLine
                : scope === "mine"
                  ? "No tenés pendientes asignados. Probá ver toda la inmobiliaria."
                  : "No hay pendientes urgentes. Revisá la agenda por si aparece algo nuevo."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScopeToggle scope={scope} onChange={setScope} />
            <Link href="/agenda">
              <Button size="sm" variant="outline">
                Agenda
              </Button>
            </Link>
            <Link href="/visitas">
              <Button size="sm" variant="outline">
                Visitas
              </Button>
            </Link>
            <Link href="/leads">
              <Button size="sm" variant="outline">
                Consultas
              </Button>
            </Link>
          </div>
        </div>

        {stats.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {stats.map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition hover:opacity-90 ${
                  stat.tone === "primary"
                    ? TONE_STYLES.sky.chip
                    : stat.tone === "warning"
                      ? TONE_STYLES.amber.chip
                      : stat.tone === "danger"
                        ? TONE_STYLES.rose.chip
                        : "bg-[var(--muted)] text-[var(--foreground)]"
                }`}
              >
                <span className="tabular-nums">{stat.count}</span>
                <span>{stat.label}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 p-4 sm:p-6">
        {sectionKeys.length > 1 ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-[var(--muted-foreground)]"
              disabled={allExpanded}
              onClick={expandAll}
            >
              Expandir todo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-[var(--muted-foreground)]"
              disabled={allCollapsed}
              onClick={collapseAll}
            >
              Colapsar todo
            </Button>
          </div>
        ) : null}

        {filtered.timelineToday.length > 0 ? (
          <DayTimeline
            entries={filtered.timelineToday}
            brief={brief}
            userId={userId}
            scope={scope}
            expanded={expanded.timeline !== false}
            onToggle={() => toggleSection("timeline")}
          />
        ) : null}

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)]/20 px-6 py-10 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">
              {scope === "mine"
                ? "Nada asignado a vos por ahora"
                : "Todo tranquilo por ahora"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {scope === "mine"
                ? "Cambiá a «Toda la inmobiliaria» para ver pendientes del equipo."
                : "Podés revisar propiedades, contratos o la agenda por si surge algo."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {groups.map((group) => (
              <NotificationGroup
                key={group.id}
                group={group}
                expanded={expanded[group.id] !== false}
                onToggle={() => toggleSection(group.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScopeToggle({
  scope,
  onChange,
}: {
  scope: AgentScope;
  onChange: (scope: AgentScope) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-0.5">
      <button
        type="button"
        onClick={() => onChange("mine")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          scope === "mine"
            ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        }`}
      >
        Mis pendientes
      </button>
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          scope === "all"
            ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        }`}
      >
        Toda la inmobiliaria
      </button>
    </div>
  );
}

function CollapsibleSection({
  id,
  expanded,
  onToggle,
  tone,
  icon: Icon,
  title,
  count,
  description,
  preview,
  href,
  children,
}: {
  id: string;
  expanded: boolean;
  onToggle: () => void;
  tone: keyof typeof TONE_STYLES;
  icon: LucideIcon;
  title: string;
  count: number;
  description: string;
  preview: string;
  href: string;
  children: React.ReactNode;
}) {
  const styles = TONE_STYLES[tone];
  const panelId = `agent-panel-${id}`;

  return (
    <section
      className={`overflow-hidden rounded-2xl border transition-shadow ${styles.border} bg-[var(--card)] ${
        expanded ? "shadow-sm" : "hover:shadow-sm"
      }`}
    >
      <div className={`relative ${expanded ? styles.header : ""}`}>
        {!expanded ? (
          <div
            aria-hidden
            className={`absolute inset-y-0 left-0 w-1 ${styles.dot}`}
          />
        ) : null}
        <div
          className={`flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 ${
            expanded ? "border-b border-[var(--border)]/60" : ""
          }`}
        >
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition hover:opacity-90"
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold">{title}</h3>
                <Badge variant="secondary" className="tabular-nums">
                  {count}
                </Badge>
              </div>
              {expanded ? (
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {description}
                </p>
              ) : preview ? (
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {preview}
                </p>
              ) : (
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {description}
                </p>
              )}
            </div>
            <ChevronDown
              className={`size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-[var(--muted)]/50 hover:underline"
          >
            Ver todo
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </div>

      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={
              count > MAX_ITEMS_BEFORE_SCROLL
                ? "max-h-[min(320px,50vh)] overflow-y-auto overscroll-contain"
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildItemPreview(
  items: Array<{ title: string }>,
  max = 2,
): string {
  if (items.length === 0) return "";
  const shown = items.slice(0, max).map((i) => i.title);
  const rest = items.length - shown.length;
  if (rest > 0) {
    return `${shown.join(" · ")} · +${rest} más`;
  }
  return shown.join(" · ");
}

function buildTimelinePreview(entries: AgentTimelineEntry[]): string {
  if (entries.length === 0) return "";
  const parts = entries.slice(0, 3).map((e) =>
    e.timeLabel ? `${e.timeLabel} ${e.title}` : e.title,
  );
  const rest = entries.length - parts.length;
  if (rest > 0) return `${parts.join(" · ")} · +${rest} más`;
  return parts.join(" · ");
}

function DayTimeline({
  entries,
  brief,
  userId,
  scope,
  expanded,
  onToggle,
}: {
  entries: AgentTimelineEntry[];
  brief: AgentDailyBrief;
  userId: string;
  scope: AgentScope;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <CollapsibleSection
      id="timeline"
      expanded={expanded}
      onToggle={onToggle}
      tone="sky"
      icon={Clock}
      title="Timeline del día"
      count={entries.length}
      description="Agenda cronológica de hoy"
      preview={buildTimelinePreview(entries)}
      href="/agenda"
    >
      <ol className="relative px-4 py-3">
        <div
          aria-hidden
          className="absolute bottom-3 left-[1.65rem] top-3 w-px bg-[var(--border)]"
        />
        {entries.map((entry, index) => {
          const tone = TIMELINE_KIND_TONE[entry.kind];
          const styles = TONE_STYLES[tone];
          const visit = brief.visitsToday.find((v) => v.id === entry.refId);
          const lead = brief.pendingLeads.find((l) => l.id === entry.refId);
          const bill = brief.overdueBills.find((b) => b.id === entry.refId);

          return (
            <li
              key={entry.id}
              className={`relative flex gap-3 pb-3 ${index === entries.length - 1 ? "pb-0" : ""}`}
            >
              <span
                className={`relative z-10 mt-1 flex size-3 shrink-0 rounded-full ring-4 ring-[var(--card)] ${styles.dot}`}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.timeLabel ? (
                        <span className="text-xs font-semibold tabular-nums text-[var(--primary)]">
                          {entry.timeLabel}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-[var(--muted-foreground)]">
                          Sin horario
                        </span>
                      )}
                      <Link
                        href={entry.href}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {entry.title}
                      </Link>
                    </div>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {entry.subtitle}
                    </p>
                  </div>
                </div>
                <TimelineActions
                  entry={entry}
                  visit={visit}
                  lead={lead}
                  bill={bill}
                  orgName={brief.organizationName}
                  userId={userId}
                  scope={scope}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </CollapsibleSection>
  );
}

function TimelineActions({
  entry,
  visit,
  lead,
  bill,
  orgName,
  userId,
  scope,
}: {
  entry: AgentTimelineEntry;
  visit?: AgentBriefVisit;
  lead?: AgentBriefLead;
  bill?: AgentDailyBrief["overdueBills"][number];
  orgName: string;
  userId: string;
  scope: AgentScope;
}) {
  if (entry.kind === "visit" && visit) {
    return (
      <ItemActionRow>
        <CopyMessageButton
          label="WhatsApp"
          text={buildVisitConfirmMessage({
            orgName,
            visitorName: visit.name,
            propertyTitle: visit.propertyTitle,
            timeLabel: visit.timeLabel,
            dateLabel: "hoy",
          })}
        />
        {visit.unassigned && scope === "all" ? (
          <QuickActionButton
            label="Asignarme"
            icon={UserPlus}
            action={() => claimUnassignedVisitAction(visit.id)}
          />
        ) : null}
      </ItemActionRow>
    );
  }

  if (entry.kind === "lead" && lead) {
    return (
      <ItemActionRow>
        <CopyMessageButton
          label="WhatsApp"
          text={buildLeadReplyMessage({
            orgName,
            leadName: lead.name,
            propertyTitle: lead.propertyTitle,
          })}
        />
        <QuickActionButton
          label="Contactada"
          action={() => markLeadContactedAction(lead.id)}
        />
        {!lead.assigneeId || lead.assigneeId !== userId ? (
          <QuickActionButton
            label="Asignarme"
            icon={UserPlus}
            action={() => assignLeadToMeAction(lead.id)}
          />
        ) : null}
      </ItemActionRow>
    );
  }

  if (entry.kind === "bill" && bill) {
    return (
      <ItemActionRow>
        <CopyMessageButton
          label="Recordatorio"
          text={buildMoraReminderMessage({
            orgName,
            propertyTitle: bill.propertyTitle,
            balance: bill.balance,
            currency: bill.currency,
            dueDate: bill.dueDate,
          })}
        />
      </ItemActionRow>
    );
  }

  return null;
}

function ItemActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1.5">{children}</div>
  );
}

function CopyMessageButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1 px-2 text-xs"
      onClick={() => void copy()}
    >
      {copied ? (
        <Check className="size-3" />
      ) : (
        <Copy className="size-3" />
      )}
      {copied ? "Copiado" : label}
    </Button>
  );
}

function QuickActionButton({
  label,
  icon: Icon,
  action,
}: {
  label: string;
  icon?: LucideIcon;
  action: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="h-7 gap-1 px-2 text-xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await action();
          router.refresh();
        })
      }
    >
      {Icon ? <Icon className="size-3" /> : null}
      {label}
    </Button>
  );
}

function NotificationGroup({
  group,
  expanded,
  onToggle,
}: {
  group: GroupConfig;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <CollapsibleSection
      id={group.id}
      expanded={expanded}
      onToggle={onToggle}
      tone={group.tone}
      icon={group.icon}
      title={group.title}
      count={group.count}
      description={group.description}
      preview={group.preview}
      href={group.href}
    >
      <ul className="divide-y divide-[var(--border)]/60">
        {group.items.map((item) => (
          <li key={item.id}>
            <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:px-4 sm:py-3">
              <Link
                href={item.href}
                className="min-w-0 flex-1 transition hover:opacity-80"
              >
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {item.subtitle}
                </p>
              </Link>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {item.actions}
                {item.badge ? item.badge : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}

function buildStats(brief: AgentDailyBrief): StatChip[] {
  const stats: StatChip[] = [];
  if (brief.visitsToday.length > 0) {
    stats.push({
      label: "visitas hoy",
      count: brief.visitsToday.length,
      href: "/visitas",
      tone: "primary",
    });
  }
  if (brief.pendingLeads.length > 0) {
    stats.push({
      label: "consultas",
      count: brief.pendingLeads.length,
      href: "/leads?status=NEW",
      tone: "warning",
    });
  }
  if (brief.overdueBills.length > 0) {
    stats.push({
      label: "en mora",
      count: brief.overdueBills.length,
      href: "/cobros?status=OVERDUE",
      tone: "danger",
    });
  }
  if (brief.openWorkOrders.length > 0) {
    stats.push({
      label: "reclamos",
      count: brief.openWorkOrders.length,
      href: "/mantenimiento",
      tone: "muted",
    });
  }
  if (brief.expiringContracts.length > 0) {
    stats.push({
      label: "por vencer",
      count: brief.expiringContracts.length,
      href: "/contratos",
      tone: "muted",
    });
  }
  return stats;
}

function buildGroups(
  filtered: AgentDailyBrief,
  fullBrief: AgentDailyBrief,
  userId: string,
  scope: AgentScope,
): GroupConfig[] {
  const orgName = fullBrief.organizationName;
  const groups: GroupConfig[] = [];

  if (filtered.visitsToday.length > 0) {
    const items = filtered.visitsToday.map((v) => ({
      id: v.id,
      href: "/visitas",
      title: `${v.timeLabel} · ${v.propertyTitle}`,
      subtitle: v.name,
      badge: v.unassigned ? (
        <Badge variant="warning">Sin asignar</Badge>
      ) : (
        <Badge variant="secondary">{v.assigneeName}</Badge>
      ),
      actions: (
        <VisitQuickActions visit={v} orgName={orgName} scope={scope} />
      ),
    }));
    groups.push({
      id: "visits-today",
      title: "Visitas hoy",
      description: "Turnos agendados para hoy",
      preview: buildItemPreview(items),
      href: "/visitas",
      icon: Calendar,
      tone: "sky",
      count: filtered.visitsToday.length,
      items,
    });
  }

  if (filtered.pendingLeads.length > 0) {
    const items = filtered.pendingLeads.map((l) => ({
      id: l.id,
      href: "/leads?status=NEW",
      title: l.name,
      subtitle: l.propertyTitle ?? l.messagePreview,
      badge: <Badge variant="warning">Nueva</Badge>,
      actions: (
        <LeadQuickActions lead={l} orgName={orgName} userId={userId} />
      ),
    }));
    groups.push({
      id: "leads",
      title: "Consultas sin responder",
      description: "Mensajes nuevos del portal",
      preview: buildItemPreview(items),
      href: "/leads?status=NEW",
      icon: MessageSquare,
      tone: "amber",
      count: filtered.pendingLeads.length,
      items,
    });
  }

  if (filtered.overdueBills.length > 0) {
    const items = filtered.overdueBills.map((b) => ({
      id: b.id,
      href: `/cobros/${b.id}`,
      title: b.propertyTitle,
      subtitle: `${b.contractCode} · venc. ${formatDateOnly(new Date(b.dueDate))}`,
      badge: (
        <Badge variant="danger">
          {formatMoney(b.balance, b.currency as "ARS" | "USD" | "EUR")}
        </Badge>
      ),
      actions: (
        <CopyMessageButton
          label="Recordatorio"
          text={buildMoraReminderMessage({
            orgName,
            propertyTitle: b.propertyTitle,
            balance: b.balance,
            currency: b.currency,
            dueDate: b.dueDate,
          })}
        />
      ),
    }));
    groups.push({
      id: "bills",
      title: "Cuotas en mora",
      description: "Inquilinos con atraso",
      preview: buildItemPreview(items),
      href: "/cobros?status=OVERDUE",
      icon: FileText,
      tone: "rose",
      count: filtered.overdueBills.length,
      items,
    });
  }

  if (filtered.openWorkOrders.length > 0) {
    const items = filtered.openWorkOrders.map((w) => ({
      id: w.id,
      href: `/mantenimiento/${w.id}`,
      title: w.title,
      subtitle: w.propertyTitle,
      badge: <Badge variant="outline">{w.status}</Badge>,
    }));
    groups.push({
      id: "work-orders",
      title: "Reclamos abiertos",
      description: "Mantenimiento pendiente",
      preview: buildItemPreview(items),
      href: "/mantenimiento",
      icon: Wrench,
      tone: "orange",
      count: filtered.openWorkOrders.length,
      items,
    });
  }

  if (filtered.expiringContracts.length > 0) {
    const items = filtered.expiringContracts.map((c) => ({
      id: c.id,
      href: `/contratos/${c.id}`,
      title: c.propertyTitle,
      subtitle: `${c.code} · fin ${formatDateOnly(new Date(c.endDate))}`,
      badge: <Badge variant="secondary">{c.daysLeft} días</Badge>,
    }));
    groups.push({
      id: "contracts",
      title: "Contratos por vencer",
      description: "Próximos 30 días",
      preview: buildItemPreview(items),
      href: "/contratos",
      icon: FileText,
      tone: "violet",
      count: filtered.expiringContracts.length,
      items,
    });
  }

  if (filtered.visitsTomorrow.length > 0) {
    const items = filtered.visitsTomorrow.map((v) => ({
      id: v.id,
      href: "/agenda",
      title: `${v.timeLabel} · ${v.propertyTitle}`,
      subtitle: v.name,
      actions:
        v.unassigned && scope === "all" ? (
          <QuickActionButton
            label="Asignarme"
            icon={UserPlus}
            action={() => claimUnassignedVisitAction(v.id)}
          />
        ) : undefined,
    }));
    groups.push({
      id: "visits-tomorrow",
      title: "Visitas mañana",
      description: "Para planificar con anticipación",
      preview: buildItemPreview(items),
      href: "/agenda",
      icon: CalendarClock,
      tone: "teal",
      count: filtered.visitsTomorrow.length,
      items,
    });
  }

  return groups;
}

function VisitQuickActions({
  visit,
  orgName,
  scope,
}: {
  visit: AgentBriefVisit;
  orgName: string;
  scope: AgentScope;
}) {
  return (
    <ItemActionRow>
      <CopyMessageButton
        label="WhatsApp"
        text={buildVisitConfirmMessage({
          orgName,
          visitorName: visit.name,
          propertyTitle: visit.propertyTitle,
          timeLabel: visit.timeLabel,
          dateLabel: "hoy",
        })}
      />
      {visit.unassigned && scope === "all" ? (
        <QuickActionButton
          label="Asignarme"
          icon={UserPlus}
          action={() => claimUnassignedVisitAction(visit.id)}
        />
      ) : null}
    </ItemActionRow>
  );
}

function LeadQuickActions({
  lead,
  orgName,
  userId,
}: {
  lead: AgentBriefLead;
  orgName: string;
  userId: string;
}) {
  return (
    <ItemActionRow>
      <CopyMessageButton
        label="WhatsApp"
        text={buildLeadReplyMessage({
          orgName,
          leadName: lead.name,
          propertyTitle: lead.propertyTitle,
        })}
      />
      <QuickActionButton
        label="Contactada"
        action={() => markLeadContactedAction(lead.id)}
      />
      {!lead.assigneeId || lead.assigneeId !== userId ? (
        <QuickActionButton
          label="Asignarme"
          icon={UserPlus}
          action={() => assignLeadToMeAction(lead.id)}
        />
      ) : null}
    </ItemActionRow>
  );
}
