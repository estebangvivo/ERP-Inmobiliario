import Link from "next/link";
import { requireSession, isStaffRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { BILL_STATUS_LABELS, LEAD_STATUS_LABELS, ROLE_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  propertyScopeWhere,
  contractScopeWhere,
  billScopeWhere,
  workOrderScopeWhere,
  leadScopeWhere,
} from "@/lib/tenant-scope";
import { hasModule } from "@/features/auth/lib/modules";
import { syncOverdueBills } from "@/server/services/billing";
import { listOwnersPendingSettlement } from "@/server/services/monthly-job";
import { getStaffDaySnapshot } from "@/server/queries/ops-snapshot";
import { getAgentDailyBrief } from "@/server/queries/agent-daily-brief";
import { PortalHome, StaffOpsBoard } from "@/components/erp/portal-home";
import { AgentDailyAssistant } from "@/components/erp/agent-daily-assistant";

const DUE_SOON_DAYS = 7;

export default async function DashboardPage() {
  const session = await requireSession();
  const role = session.organizationRole;
  const staff = isStaffRole(role);
  const canSeeLeads = staff || hasModule(session.allowedModules, "consultas");
  const canSeeProperties = hasModule(session.allowedModules, "propiedades");
  const canSeeBills = hasModule(session.allowedModules, "cobros");
  const canSeeWorkOrders = hasModule(session.allowedModules, "mantenimiento");
  const canSeeSettlements =
    staff || hasModule(session.allowedModules, "rendiciones");

  await syncOverdueBills(session.organizationId);

  const propertyWhere = propertyScopeWhere(session);
  const contractWhere = contractScopeWhere(session);
  const billWhere = billScopeWhere(session);
  const workOrderWhere = workOrderScopeWhere(session);
  const leadWhere = canSeeLeads
    ? leadScopeWhere(session)
    : ({ id: "__none__" } as const);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dueSoonEnd = new Date(todayUtc);
  dueSoonEnd.setUTCDate(dueSoonEnd.getUTCDate() + DUE_SOON_DAYS);

  const emptyDashboard = {
    properties: 0,
    contracts: 0,
    pendingBills: 0,
    overdueBills: 0,
    dueSoonBills: 0,
    openLeads: 0,
    openWorkOrders: 0,
    paymentsThisMonth: [] as { amount: { toString(): string } | number; currency: "ARS" | "USD" | "EUR" }[],
    recentBills: [] as Array<{
      id: string;
      periodMonth: number;
      periodYear: number;
      status: "PENDING" | "PARTIAL" | "OVERDUE" | "PAID" | "CANCELLED";
      dueDate: Date;
      paidAmount: { toString(): string } | number;
      totalAmount: { toString(): string } | number;
      currency: "ARS" | "USD" | "EUR";
      contract: { property: { title: string } };
    }>,
    recentLeads: [] as Array<{
      id: string;
      name: string;
      property: { title: string } | null;
    }>,
  };

  let properties = emptyDashboard.properties;
  let contracts = emptyDashboard.contracts;
  let pendingBills = emptyDashboard.pendingBills;
  let overdueBills = emptyDashboard.overdueBills;
  let dueSoonBills = emptyDashboard.dueSoonBills;
  let openLeads = emptyDashboard.openLeads;
  let openWorkOrders = emptyDashboard.openWorkOrders;
  let paymentsThisMonth = emptyDashboard.paymentsThisMonth;
  let recentBills = emptyDashboard.recentBills;
  let recentLeads = emptyDashboard.recentLeads;

  try {
    [
      properties,
      contracts,
      pendingBills,
      overdueBills,
      dueSoonBills,
      openLeads,
      openWorkOrders,
      paymentsThisMonth,
      recentBills,
      recentLeads,
    ] = await Promise.all([
      prisma.property.count({ where: propertyWhere }),
      prisma.contract.count({
        where: { ...contractWhere, status: "ACTIVE" },
      }),
      prisma.tenantBill.count({
        where: {
          AND: [billWhere, { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } }],
        },
      }),
      prisma.tenantBill.count({
        where: {
          AND: [billWhere, { status: "OVERDUE" }],
        },
      }),
      canSeeBills
        ? prisma.tenantBill.count({
            where: {
              AND: [
                billWhere,
                { status: { in: ["PENDING", "PARTIAL"] } },
                { dueDate: { gte: todayUtc, lt: dueSoonEnd } },
              ],
            },
          })
        : Promise.resolve(0),
      canSeeLeads
        ? prisma.lead.count({ where: { ...leadWhere, status: "NEW" } })
        : Promise.resolve(0),
      prisma.workOrder.count({
        where: {
          AND: [
            workOrderWhere,
            { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
          ],
        },
      }),
      prisma.payment.findMany({
        where: {
          paidAt: { gte: periodStart, lt: periodEnd },
          tenantBill: billWhere,
        },
        select: { amount: true, currency: true },
      }),
      prisma.tenantBill.findMany({
        where: billWhere,
        take: 6,
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          periodMonth: true,
          periodYear: true,
          status: true,
          dueDate: true,
          paidAmount: true,
          totalAmount: true,
          currency: true,
          contract: {
            select: {
              property: { select: { title: true } },
            },
          },
        },
      }),
      canSeeLeads
        ? prisma.lead.findMany({
            where: { ...leadWhere, status: "NEW" },
            take: 5,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              property: { select: { title: true } },
            },
          })
        : Promise.resolve([]),
    ]);
  } catch (error) {
    console.error("dashboard queries", error);
  }

  const pendingSettlements =
    staff && canSeeSettlements
      ? await listOwnersPendingSettlement({
          organizationId: session.organizationId,
          periodYear: year,
          periodMonth: month,
        }).catch((error) => {
          console.error("dashboard settlements", error);
          return [];
        })
      : [];

  const daySnapshot = staff
    ? await getStaffDaySnapshot(session.organizationId).catch((error) => {
        console.error("dashboard ops snapshot", error);
        return null;
      })
    : null;

  const agentBrief =
    role === "AGENT"
      ? await getAgentDailyBrief(
          session.organizationId,
          session.user.name,
        ).catch((error) => {
          console.error("dashboard agent brief", error);
          return null;
        })
      : null;

  const collectedByCurrency = paymentsThisMonth.reduce<Record<string, number>>(
    (acc, p) => {
      acc[p.currency] = (acc[p.currency] ?? 0) + Number(p.amount);
      return acc;
    },
    {},
  );

  const subtitle =
    role === "TENANT"
      ? `Tu resumen como inquilino · ${month}/${year}`
      : role === "OWNER"
        ? `Tu resumen como propietario · ${month}/${year}`
        : role === "AGENT"
          ? `Asistente diario · ${month}/${year}`
          : `Resumen operativo · ${month}/${year}`;

  const propertiesLabel =
    role === "TENANT"
      ? "Mis unidades"
      : role === "OWNER"
        ? "Mis propiedades"
        : "Propiedades";
  const contractsLabel =
    role === "TENANT" || role === "OWNER"
      ? "Mis contratos activos"
      : "Contratos activos";
  const pendingLabel =
    role === "TENANT" ? "Mis cuotas pendientes" : "Cuotas pendientes";
  const collectedLabel =
    role === "TENANT"
      ? "Pagado este mes"
      : role === "OWNER"
        ? "Cobrado de mis contratos"
        : "Cobrado este mes";
  const billsSectionTitle =
    role === "TENANT" ? "Mis últimas cuotas" : "Últimas cuotas";
  const billsSectionDesc =
    role === "TENANT"
      ? "Tus liquidaciones recientes"
      : role === "OWNER"
        ? "Facturación de tus contratos"
        : "Facturación reciente a inquilinos";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Hola, {session.user.name}
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          {subtitle}
          <span className="mx-1.5 text-[var(--border)]">·</span>
          {ROLE_LABELS[role]}
        </p>
      </div>

      {agentBrief ? (
        <AgentDailyAssistant brief={agentBrief} userId={session.user.id} />
      ) : null}

      {staff && daySnapshot ? (
        <StaffOpsBoard
          collected={daySnapshot.collected}
          paidOut={daySnapshot.paidOut}
          paymentsToday={daySnapshot.paymentsToday}
          ordersToday={daySnapshot.ordersToday}
          dueBills={daySnapshot.dueBills}
        />
      ) : null}

      {role === "TENANT" || role === "OWNER" ? (
        <PortalHome session={session} />
      ) : null}

      {staff ? (
        <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeProperties ? (
          <StatCard
            title={propertiesLabel}
            value={String(properties)}
            href="/gestion/propiedades"
          />
        ) : null}
        <StatCard
          title={contractsLabel}
          value={String(contracts)}
          href="/contratos"
        />
        {canSeeBills ? (
          <StatCard
            title={pendingLabel}
            value={String(pendingBills)}
            href="/cobros"
          />
        ) : null}
        {canSeeLeads ? (
          <StatCard
            title="Consultas nuevas"
            value={String(openLeads)}
            href="/leads"
          />
        ) : canSeeWorkOrders ? (
          <StatCard
            title="OT abiertas"
            value={String(openWorkOrders)}
            href="/mantenimiento"
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {canSeeBills ? (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{collectedLabel}</CardDescription>
              <CardTitle className="text-2xl">
                {Object.keys(collectedByCurrency).length === 0
                  ? "$ 0"
                  : Object.entries(collectedByCurrency)
                      .map(([currency, amount]) =>
                        formatMoney(
                          String(amount),
                          currency as "ARS" | "USD" | "EUR",
                        ),
                      )
                      .join(" · ")}
              </CardTitle>
            </CardHeader>
          </Card>
        ) : null}
        {canSeeBills ? (
          <StatCard
            title={role === "TENANT" ? "Mis cuotas vencidas" : "Cuotas vencidas"}
            value={String(overdueBills)}
            href="/cobros?status=OVERDUE"
          />
        ) : null}
        {canSeeBills ? (
          <StatCard
            title={
              role === "TENANT"
                ? `Mis cuotas por vencer (${DUE_SOON_DAYS}d)`
                : `Por vencer (${DUE_SOON_DAYS}d)`
            }
            value={String(dueSoonBills)}
            href="/cobros?status=PENDING"
          />
        ) : null}
        {staff && canSeeSettlements ? (
          <StatCard
            title="Pendientes de rendir"
            value={String(pendingSettlements.length)}
            href="/rendiciones"
          />
        ) : null}
        {canSeeLeads && canSeeWorkOrders ? (
          <StatCard
            title="OT abiertas"
            value={String(openWorkOrders)}
            href="/mantenimiento"
          />
        ) : null}
      </div>

      <div className={`grid gap-4 ${canSeeLeads ? "lg:grid-cols-2" : ""}`}>
        {canSeeBills ? (
          <Card>
            <CardHeader>
              <CardTitle>{billsSectionTitle}</CardTitle>
              <CardDescription>{billsSectionDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {recentBills.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  {role === "TENANT"
                    ? "Todavía no tenés cuotas asignadas."
                    : role === "OWNER"
                      ? "Todavía no hay cuotas en tus contratos."
                      : "Todavía no hay cuotas. Generá el período desde Cobros."}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {recentBills.map((bill) => (
                    <li key={bill.id}>
                      <Link
                        href={`/cobros/${bill.id}`}
                        className="flex items-center justify-between gap-4 py-3 text-sm hover:opacity-80"
                      >
                        <div>
                          <p className="font-medium">
                            {bill.contract.property.title}
                          </p>
                          <p className="text-[var(--muted-foreground)]">
                            {bill.periodMonth}/{bill.periodYear} ·{" "}
                            {BILL_STATUS_LABELS[bill.status]}
                          </p>
                        </div>
                        <p className="font-semibold">
                          {formatMoney(
                            bill.totalAmount.toString(),
                            bill.currency,
                          )}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {canSeeLeads ? (
          <Card>
            <CardHeader>
              <CardTitle>Consultas recientes</CardTitle>
              <CardDescription>Consultas del portal público</CardDescription>
            </CardHeader>
            <CardContent>
              {recentLeads.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Sin consultas nuevas.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {recentLeads.map((lead) => (
                    <li
                      key={lead.id}
                      className="flex items-start justify-between gap-3 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="text-[var(--muted-foreground)]">
                          {lead.property?.title ?? "Consulta general"}
                        </p>
                      </div>
                      <Badge variant="warning">{LEAD_STATUS_LABELS.NEW}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <div className="pt-3">
                <Link
                  href="/leads"
                  className="text-sm text-[var(--primary)] underline"
                >
                  Ver todas las consultas
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  title,
  value,
  href,
}: {
  title: string;
  value: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-[var(--ring)]">
        <CardHeader className="pb-2">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-3xl">{value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}
