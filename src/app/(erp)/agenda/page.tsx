import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import {
  AgendaMonthPanel,
  type AgendaVisitItem,
  type AgendaMonthCell,
} from "@/components/erp/agenda-month-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasModule } from "@/features/auth/lib/modules";
import {
  formatArtDateKey,
  formatArtTimeLabel,
} from "@/lib/visit-slots";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import {
  getVisitScheduleSettings,
  listVisitBookableProperties,
} from "@/server/actions/visit-bookings";

const ART_OFFSET_MS = -3 * 60 * 60 * 1000;

function artTodayKey() {
  const shifted = new Date(Date.now() + ART_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function startOfArtDayUtc(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 3, 0, 0));
}

function endOfArtDayUtc(dateKey: string) {
  const start = startOfArtDayUtc(dateKey);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseMonthParam(raw: string | undefined, todayKey: string) {
  const match = raw?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  const [y, m] = todayKey.split("-").map(Number);
  return { year: y!, month: m! };
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
  };
}

/** Grilla lun–dom del mes (incluye días del mes anterior/siguiente). */
function buildMonthCells(year: number, month: number): AgendaMonthCell[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const mondayOffset = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const start = new Date(Date.UTC(year, month - 1, 1 - mondayOffset));
  const cells: AgendaMonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    cells.push({
      dateKey: `${y}-${pad2(m)}-${pad2(day)}`,
      day,
      inMonth: y === year && m === month,
    });
  }
  let lastInMonth = -1;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i]!.inMonth) {
      lastInMonth = i;
      break;
    }
  }
  if (lastInMonth < 0) return cells;
  const end = Math.ceil((lastInMonth + 1) / 7) * 7;
  return cells.slice(0, end);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const session = await requireModule("consultas");
  const staff = isStaffRole(session.organizationRole);
  const canTurnero =
    staff || hasModule(session.allowedModules, "turnero");
  const sp = await searchParams;

  const todayKey = artTodayKey();
  const { year, month } = parseMonthParam(sp.mes, todayKey);
  const cells = buildMonthCells(year, month);

  // Incluir padding de la grilla para visitas visibles en bordes
  const rangeStartUtc = startOfArtDayUtc(cells[0]!.dateKey);
  const rangeEndUtc = endOfArtDayUtc(cells[cells.length - 1]!.dateKey);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const prevHref = `/agenda?mes=${prev.year}-${pad2(prev.month)}`;
  const nextHref = `/agenda?mes=${next.year}-${pad2(next.month)}`;

  const monthLabel = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  const [visits, turnosHoy, properties, scheduleSettings] = await Promise.all([
    prisma.propertyVisitBooking.findMany({
      where: {
        organizationId: session.organizationId,
        status: { in: ["RESERVED", "COMPLETED"] },
        startsAt: { gte: rangeStartUtc, lt: rangeEndUtc },
      },
      include: {
        property: { select: { title: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
    canTurnero
      ? prisma.turneroTurno.findMany({
          where: {
            organizationId: session.organizationId,
            estado: { in: ["ESPERA", "LLAMADO"] },
            creadoEn: {
              gte: startOfArtDayUtc(todayKey),
              lt: endOfArtDayUtc(todayKey),
            },
          },
          include: { cliente: true },
          orderBy: { creadoEn: "asc" },
          take: 40,
        })
      : Promise.resolve([]),
    staff ? listVisitBookableProperties() : Promise.resolve([]),
    getVisitScheduleSettings(),
  ]);

  const visitsByDay: Record<string, AgendaVisitItem[]> = {};
  for (const cell of cells) visitsByDay[cell.dateKey] = [];
  for (const v of visits) {
    const key = formatArtDateKey(v.startsAt);
    const list = visitsByDay[key];
    if (list) {
      list.push({
        id: v.id,
        startsAt: v.startsAt.toISOString(),
        timeLabel: formatArtTimeLabel(v.startsAt),
        name: v.name,
        propertyTitle: v.property.title,
        assigneeName: v.assignee?.name ?? null,
        status: v.status as "RESERVED" | "COMPLETED",
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="Calendario mensual de visitas. Podés agendar cualquier propiedad activa, esté o no en el portal."
        actions={
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/visitas" className="text-[var(--primary)] underline">
              Visitas
            </Link>
            {canTurnero ? (
              <Link href="/turnero" className="text-[var(--primary)] underline">
                Turnero
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <AgendaMonthPanel
          year={year}
          month={month}
          monthLabel={monthLabel}
          todayKey={todayKey}
          cells={cells}
          visitsByDay={visitsByDay}
          properties={properties}
          scheduleSummary={scheduleSettings.summary}
          canCreate={staff}
          prevHref={prevHref}
          nextHref={nextHref}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Turnero hoy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!canTurnero ? (
              <p className="text-[var(--muted-foreground)]">
                Sin acceso al módulo turnero.
              </p>
            ) : turnosHoy.length === 0 ? (
              <p className="text-[var(--muted-foreground)]">
                No hay turnos en espera o llamados.
              </p>
            ) : (
              turnosHoy.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0"
                >
                  <div>
                    <p className="font-medium">{t.codigo}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {t.categoria}
                      {t.cliente?.nombre ? ` · ${t.cliente.nombre}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={t.estado === "LLAMADO" ? "warning" : "secondary"}
                  >
                    {t.estado}
                  </Badge>
                </div>
              ))
            )}
            {canTurnero ? (
              <Link
                href="/turnero/operador"
                className="mt-2 inline-block text-[var(--primary)] underline"
              >
                Ir al operador
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
