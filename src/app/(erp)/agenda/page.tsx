import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasModule } from "@/features/auth/lib/modules";
import {
  formatArtDateKey,
  formatArtDisplay,
  formatArtTimeLabel,
} from "@/lib/visit-slots";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";

const ART_OFFSET_MS = -3 * 60 * 60 * 1000;

function artTodayKey() {
  const shifted = new Date(Date.now() + ART_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function startOfArtDayUtc(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 3, 0, 0)); // ART midnight ≈ UTC 03:00
}

function endOfArtDayUtc(dateKey: string) {
  const start = startOfArtDayUtc(dateKey);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
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

  const visits = await prisma.propertyVisitBooking.findMany({
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
  });

  const turnosHoy = canTurnero
    ? await prisma.turneroTurno.findMany({
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
    : [];

  const visitsByDay = new Map<string, typeof visits>();
  for (const key of weekKeys) visitsByDay.set(key, []);
  for (const v of visits) {
    const key = formatArtDateKey(v.startsAt);
    const list = visitsByDay.get(key);
    if (list) list.push(v);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="Vista unificada: visitas del portal esta semana y cola del turnero de hoy."
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
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Visitas · semana</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {weekKeys.map((key) => {
              const dayVisits = visitsByDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <Card
                  key={key}
                  className={isToday ? "border-[var(--primary)]" : undefined}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {formatArtDisplay(startOfArtDayUtc(key))}
                      {isToday ? (
                        <Badge className="ml-2" variant="secondary">
                          Hoy
                        </Badge>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {dayVisits.length === 0 ? (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Sin visitas
                      </p>
                    ) : (
                      dayVisits.map((v) => (
                        <div
                          key={v.id}
                          className="rounded-md border border-[var(--border)] p-2"
                        >
                          <p className="font-medium">
                            {formatArtTimeLabel(v.startsAt)} · {v.name}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {v.property.title}
                            {v.assignee ? ` · ${v.assignee.name}` : ""}
                          </p>
                          <Badge
                            variant={
                              v.status === "COMPLETED" ? "success" : "secondary"
                            }
                            className="mt-1"
                          >
                            {v.status === "COMPLETED"
                              ? "Completada"
                              : "Reservada"}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

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
