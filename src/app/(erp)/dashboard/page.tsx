import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { BILL_STATUS_LABELS, LEAD_STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await requireSession();
  const orgId = session.organizationId;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  const [
    properties,
    contracts,
    pendingBills,
    overdueBills,
    openLeads,
    openWorkOrders,
    paymentsThisMonth,
    recentBills,
    recentLeads,
  ] = await Promise.all([
    prisma.property.count({ where: { organizationId: orgId } }),
    prisma.contract.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
    prisma.tenantBill.count({
      where: {
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        contract: { organizationId: orgId },
      },
    }),
    prisma.tenantBill.count({
      where: {
        status: "OVERDUE",
        contract: { organizationId: orgId },
      },
    }),
    prisma.lead.count({ where: { organizationId: orgId, status: "NEW" } }),
    prisma.workOrder.count({
      where: {
        organizationId: orgId,
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
      },
    }),
    prisma.payment.findMany({
      where: {
        paidAt: { gte: periodStart, lt: periodEnd },
        tenantBill: { contract: { organizationId: orgId } },
      },
      select: { amount: true, currency: true },
    }),
    prisma.tenantBill.findMany({
      where: { contract: { organizationId: orgId } },
      take: 6,
      orderBy: { issuedAt: "desc" },
      include: {
        contract: { include: { property: true } },
      },
    }),
    prisma.lead.findMany({
      where: { organizationId: orgId, status: "NEW" },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { property: true },
    }),
  ]);

  const collectedByCurrency = paymentsThisMonth.reduce<Record<string, number>>(
    (acc, p) => {
      acc[p.currency] = (acc[p.currency] ?? 0) + Number(p.amount);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Hola, {session.user.name}
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Resumen operativo · {month}/{year}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Propiedades" value={String(properties)} href="/gestion/propiedades" />
        <StatCard title="Contratos activos" value={String(contracts)} href="/contratos" />
        <StatCard title="Cuotas pendientes" value={String(pendingBills)} href="/cobros" />
        <StatCard title="Consultas nuevas" value={String(openLeads)} href="/leads" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cobrado este mes</CardDescription>
            <CardTitle className="text-2xl">
              {Object.keys(collectedByCurrency).length === 0
                ? "$ 0"
                : Object.entries(collectedByCurrency)
                    .map(([currency, amount]) =>
                      formatMoney(String(amount), currency as "ARS" | "USD" | "EUR"),
                    )
                    .join(" · ")}
            </CardTitle>
          </CardHeader>
        </Card>
        <StatCard title="Cuotas vencidas" value={String(overdueBills)} href="/cobros?status=OVERDUE" />
        <StatCard title="OT abiertas" value={String(openWorkOrders)} href="/mantenimiento" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimas cuotas</CardTitle>
            <CardDescription>Facturación reciente a inquilinos</CardDescription>
          </CardHeader>
          <CardContent>
            {recentBills.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Todavía no hay cuotas. Generá el período desde Cobros.
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
                        <p className="font-medium">{bill.contract.property.title}</p>
                        <p className="text-[var(--muted-foreground)]">
                          {bill.periodMonth}/{bill.periodYear} ·{" "}
                          {BILL_STATUS_LABELS[bill.status]}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {formatMoney(bill.totalAmount.toString(), bill.currency)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

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
              <Link href="/leads" className="text-sm text-[var(--primary)] underline">
                Ver todas las consultas
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
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
