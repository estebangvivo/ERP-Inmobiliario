import Link from "next/link";
import { WorkOrderForm } from "@/components/erp/work-order-forms";
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
import { BILL_STATUS_LABELS, CONTRACT_STATUS_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { OrganizationSession } from "@/lib/auth";
import {
  billScopeWhere,
  contractScopeWhere,
  propertyScopeWhere,
  settlementScopeWhere,
} from "@/lib/tenant-scope";
import { getTenantDebtDetail } from "@/server/services/tenant-ledger";

export async function PortalHome({
  session,
}: {
  session: OrganizationSession;
}) {
  const role = session.organizationRole;
  const [contracts, properties, recentPaid, ownerSettlements] =
    await Promise.all([
      prisma.contract.findMany({
        where: contractScopeWhere(session),
        select: {
          id: true,
          code: true,
          status: true,
          startDate: true,
          endDate: true,
          initialRent: true,
          currency: true,
          property: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.property.findMany({
        where: propertyScopeWhere(session),
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      }),
      prisma.tenantBill.findMany({
        where: {
          AND: [billScopeWhere(session), { status: "PAID" }],
        },
        select: {
          id: true,
          periodMonth: true,
          periodYear: true,
          totalAmount: true,
          currency: true,
          contract: { select: { property: { select: { title: true } } } },
        },
        orderBy: { issuedAt: "desc" },
        take: 5,
      }),
      role === "OWNER"
        ? prisma.ownerSettlement.findMany({
            where: settlementScopeWhere(session),
            select: {
              id: true,
              code: true,
              periodMonth: true,
              periodYear: true,
              netPayout: true,
              currency: true,
              status: true,
            },
            orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
            take: 5,
          })
        : Promise.resolve([]),
    ]);

  const tenantDebt =
    role === "TENANT"
      ? await getTenantDebtDetail(session.organizationId, session.user.id)
      : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Mis contratos</CardTitle>
          <CardDescription>Condiciones vigentes y acceso al detalle.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {contracts.length === 0 ? (
            <p className="text-[var(--muted-foreground)]">Sin contratos.</p>
          ) : (
            contracts.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-0"
              >
                <div>
                  <p className="font-medium">{c.property.title}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {c.code} · {CONTRACT_STATUS_LABELS[c.status]} ·{" "}
                    {formatDateOnly(c.startDate)} → {formatDateOnly(c.endDate)}
                  </p>
                </div>
                <Link href={`/contratos/${c.id}`}>
                  <Button size="sm" variant="outline">
                    Ver
                  </Button>
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{role === "OWNER" ? "Mis liquidaciones" : "Mi saldo"}</CardTitle>
          <CardDescription>
            {role === "OWNER"
              ? "Rendiciones y PDF para descargar."
              : "Cuotas abiertas y recibos ya pagos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {role === "TENANT" ? (
            tenantDebt && Object.keys(tenantDebt.balanceByCurrency).length > 0 ? (
              <>
                <p className="text-xl font-semibold">
                  {Object.entries(tenantDebt.balanceByCurrency)
                    .map(([cur, amt]) =>
                      formatMoney(String(amt), cur as "ARS" | "USD" | "EUR"),
                    )
                    .join(" · ")}
                </p>
                <ul className="divide-y divide-[var(--border)]">
                  {tenantDebt.bills.slice(0, 5).map((b) => (
                    <li key={b.id} className="flex justify-between gap-2 py-2">
                      <span>
                        {b.propertyTitle} · {b.periodMonth}/{b.periodYear}
                      </span>
                      <span className="font-medium">
                        {formatMoney(String(b.balance), b.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href="/cobros" className="text-[var(--primary)] underline">
                  Ver todas las cuotas
                </Link>
              </>
            ) : (
              <p className="text-[var(--muted-foreground)]">
                No tenés saldo pendiente.
              </p>
            )
          ) : ownerSettlements.length === 0 ? (
            <p className="text-[var(--muted-foreground)]">
              Todavía no hay rendiciones.
            </p>
          ) : (
            ownerSettlements.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 border-b border-[var(--border)] py-2 last:border-0"
              >
                <div>
                  <p className="font-medium">{s.code}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {s.periodMonth}/{s.periodYear} · {s.status}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {formatMoney(s.netPayout.toString(), s.currency)}
                  </span>
                  <Link href={`/rendiciones/${s.id}`}>
                    <Button size="sm" variant="outline">
                      Ver
                    </Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {role === "TENANT" ? (
        <Card>
          <CardHeader>
            <CardTitle>Recibos</CardTitle>
            <CardDescription>Descargá los comprobantes de cuotas pagadas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentPaid.length === 0 ? (
              <p className="text-[var(--muted-foreground)]">Sin recibos todavía.</p>
            ) : (
              recentPaid.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-2 border-b border-[var(--border)] py-2 last:border-0"
                >
                  <div>
                    <p className="font-medium">{b.contract.property.title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {b.periodMonth}/{b.periodYear} ·{" "}
                      {formatMoney(b.totalAmount.toString(), b.currency)}
                    </p>
                  </div>
                  <a href={`/api/cobros/${b.id}/pdf`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline">
                      PDF
                    </Button>
                  </a>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className={role === "TENANT" ? "" : "lg:col-span-2"}>
        <CardHeader>
          <CardTitle>Reclamo de mantenimiento</CardTitle>
          <CardDescription>
            Informá una rotura o pedido. La inmobiliaria lo toma como orden de
            trabajo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No hay propiedades asociadas a tu usuario.
            </p>
          ) : (
            <WorkOrderForm properties={properties} suppliers={[]} portalMode />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function moneyLabel(bucket: Record<string, number>) {
  const entries = Object.entries(bucket);
  if (entries.length === 0) return "$ 0";
  return entries
    .map(([currency, amount]) =>
      formatMoney(String(amount), currency as "ARS" | "USD" | "EUR"),
    )
    .join(" · ");
}

export function StaffOpsBoard({
  collected,
  paidOut,
  paymentsToday,
  ordersToday,
  dueBills,
}: {
  collected: Record<string, number>;
  paidOut: Record<string, number>;
  paymentsToday: Array<{
    id: string;
    amount: { toString(): string } | number;
    currency: "ARS" | "USD" | "EUR";
    tenantBill: {
      id: string;
      contract: { code: string; property: { title: string } };
    };
  }>;
  ordersToday: Array<{
    id: string;
    number: string;
    partyName: string | null;
    concept: string | null;
    totalAmount: { toString(): string } | number;
    currency: string;
  }>;
  dueBills: Array<{
    id: string;
    dueDate: Date;
    status: string;
    totalAmount: { toString(): string } | number;
    paidAmount: { toString(): string } | number;
    currency: "ARS" | "USD" | "EUR";
    contract: { code: string; property: { title: string } };
  }>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Hoy cobré</CardDescription>
          <CardTitle className="text-2xl">{moneyLabel(collected)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {paymentsToday.length === 0 ? (
            <p className="text-[var(--muted-foreground)]">Sin cobros hoy.</p>
          ) : (
            paymentsToday.map((p) => (
              <Link
                key={p.id}
                href={`/cobros/${p.tenantBill.id}`}
                className="flex justify-between gap-2 hover:opacity-80"
              >
                <span className="truncate">
                  {p.tenantBill.contract.property.title}
                </span>
                <span className="shrink-0 font-medium">
                  {formatMoney(String(p.amount), p.currency)}
                </span>
              </Link>
            ))
          )}
          <Link href="/cobros" className="block text-xs text-[var(--primary)] underline">
            Ir a cobros
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Hoy pagué</CardDescription>
          <CardTitle className="text-2xl">{moneyLabel(paidOut)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {ordersToday.length === 0 ? (
            <p className="text-[var(--muted-foreground)]">Sin órdenes de pago hoy.</p>
          ) : (
            ordersToday.map((o) => (
              <Link
                key={o.id}
                href={`/tesoreria/ordenes-pago/${o.id}`}
                className="flex justify-between gap-2 hover:opacity-80"
              >
                <span className="truncate">
                  {o.number} · {o.partyName ?? o.concept ?? "OP"}
                </span>
                <span className="shrink-0 font-medium">
                  {formatMoney(
                    String(o.totalAmount),
                    o.currency as "ARS" | "USD" | "EUR",
                  )}
                </span>
              </Link>
            ))
          )}
          <Link
            href="/tesoreria"
            className="block text-xs text-[var(--primary)] underline"
          >
            Ir a tesorería
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Qué vence</CardDescription>
          <CardTitle className="text-2xl">{dueBills.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {dueBills.length === 0 ? (
            <p className="text-[var(--muted-foreground)]">Nada vencido ni por hoy.</p>
          ) : (
            dueBills.map((b) => (
              <Link
                key={b.id}
                href={`/cobros/${b.id}`}
                className="block hover:opacity-80"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{b.contract.property.title}</span>
                  <Badge
                    variant={b.status === "OVERDUE" ? "danger" : "warning"}
                  >
                    {BILL_STATUS_LABELS[
                      b.status as keyof typeof BILL_STATUS_LABELS
                    ] ?? b.status}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {formatDateOnly(b.dueDate)} ·{" "}
                  {formatMoney(
                    String(Number(b.totalAmount) - Number(b.paidAmount)),
                    b.currency,
                  )}
                </p>
              </Link>
            ))
          )}
          <Link
            href="/cobros?status=OVERDUE"
            className="block text-xs text-[var(--primary)] underline"
          >
            Ver vencidas
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
