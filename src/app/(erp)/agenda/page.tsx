import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import {
  AgendaWeekPanel,
  type AgendaVisitItem,
} from "@/components/erp/agenda-week-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasModule } from "@/features/auth/lib/modules";
import {
  formatArtDateKey,
  formatArtTimeLabel,
  VISIT_TZ,
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

function formatArtDayLabel(dateKey: string): string {
  const utc = startOfArtDayUtc(dateKey);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: VISIT_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(utc);
}

export default async function AgendaPage() {
  const session = await requireModule("consultas");
  const staff = isStaffRole(session.organizationRole);
  const canTurnero =
    staff || hasModule(session.allowedModules, "turnero");

  const todayKey = artTodayKey();
  const weekStart = (() => {
    const shifted = new Date(Date.now() + ART_OFFSET_MS);
    const weekday = shifted.getUTCDay();
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    const monday = new Date(
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate() - daysFromMonday,
      ),
    );
    return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
  })();

  const weekKeys = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const [y, m, d] = weekStart.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d! + i));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  });

  const weekStartUtc = startOfArtDayUtc(weekKeys[0]!);
  const weekEndUtc = endOfArtDayUtc(weekKeys[6]!);

  const [visits, turnosHoy, properties, scheduleSettings] = await Promise.all([
    prisma.propertyVisitBooking.findMany({
      where: {
        organizationId: session.organizationId,
        status: { in: ["RESERVED", "COMPLETED"] },
        startsAt: { gte: weekStartUtc, lt: weekEndUtc },
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
  for (const key of weekKeys) visitsByDay[key] = [];
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

  const dayLabels = Object.fromEntries(
    weekKeys.map((key) => [key, formatArtDayLabel(key)]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="Visitas del portal y turnero. Podés agendar visitas con los mismos turnos que la web."
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
        <AgendaWeekPanel
          weekKeys={weekKeys}
          todayKey={todayKey}
          dayLabels={dayLabels}
          visitsByDay={visitsByDay}
          properties={properties}
          scheduleSummary={scheduleSettings.summary}
          canCreate={staff}
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
