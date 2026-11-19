import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule, isStaffRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getRecoverableAccountStatement } from "@/server/services/recoverable-charges";
import { formatMoney } from "@/lib/money";
import { formatDateAR } from "@/lib/format-date";
import { PageHeader } from "@/components/erp/page-chrome";
import { Button } from "@/components/ui/button";
import { RecoverableRecoveryForm } from "@/components/erp/recoverable-recovery-form";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ownerId: string }>;
  searchParams: Promise<{ propertyId?: string }>;
};

export default async function CuentaRecuperablesPage({
  params,
  searchParams,
}: PageProps) {
  const session = await requireModule("tesoreria");
  if (!isStaffRole(session.organizationRole)) {
    redirect("/tesoreria");
  }

  const { ownerId } = await params;
  const { propertyId } = await searchParams;

  const stmt = await getRecoverableAccountStatement({
    organizationId: session.organizationId,
    ownerId,
    propertyId: propertyId?.trim() || undefined,
  });
  if (!stmt.owner) notFound();

  const properties = await prisma.recoverableCharge.findMany({
    where: {
      organizationId: session.organizationId,
      ownerId,
    },
    distinct: ["propertyId"],
    select: {
      propertyId: true,
      property: { select: { title: true } },
    },
    orderBy: { property: { title: "asc" } },
  });

  const [workOrders, receipts] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        organizationId: session.organizationId,
        property: {
          ownerships: { some: { ownerId } },
        },
      },
      select: {
        id: true,
        code: true,
        title: true,
        property: { select: { title: true } },
      },
      orderBy: { requestedAt: "desc" },
      take: 80,
    }),
    prisma.receipt.findMany({
      where: {
        organizationId: session.organizationId,
        status: { in: ["POSTED", "ISSUED"] },
      },
      select: {
        id: true,
        number: true,
        issueDate: true,
        partyName: true,
        totalAmount: true,
        currency: true,
      },
      orderBy: { issueDate: "desc" },
      take: 40,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={stmt.owner.name}
        description="Cuenta corriente paralela · gastos a recuperar por la inmobiliaria"
        actions={
          <Link href={`/tesoreria/cuentas/propietarios/${ownerId}`}>
            <Button variant="outline" size="sm">
              CC habitual
            </Button>
          </Link>
        }
      />
      <p className="text-sm">
        <Link
          href="/tesoreria/cuentas"
          className="text-[var(--primary)] hover:underline"
        >
          ← Cuentas corrientes
        </Link>
      </p>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="border-l-2 border-amber-600 pl-3">
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">
            Saldo pendiente
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(stmt.openBalance)}
          </dd>
        </div>
        <div className="border-l-2 border-[var(--border)] pl-3">
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">
            Cargos abiertos
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {stmt.openCharges.length}
          </dd>
        </div>
      </dl>

      {properties.length > 1 ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/tesoreria/cuentas/recuperables/${ownerId}`}
            className={
              !propertyId
                ? "font-medium text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:underline"
            }
          >
            Todas
          </Link>
          {properties.map((p) => (
            <Link
              key={p.propertyId}
              href={`/tesoreria/cuentas/recuperables/${ownerId}?propertyId=${p.propertyId}`}
              className={
                propertyId === p.propertyId
                  ? "font-medium text-[var(--primary)]"
                  : "text-[var(--muted-foreground)] hover:underline"
              }
            >
              {p.property.title}
            </Link>
          ))}
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Registrar recupero</h2>
        <RecoverableRecoveryForm
          charges={stmt.openCharges.map((c) => ({
            id: c.id,
            label: `${c.workOrderCode} · ${c.workOrderTitle} · ${c.propertyTitle}`,
            pending: c.pending,
            currency: c.currency,
          }))}
          workOrders={workOrders.map((w) => ({
            id: w.id,
            label: `${w.code} · ${w.title} · ${w.property.title}`,
          }))}
          receipts={receipts.map((r) => ({
            id: r.id,
            label: `${r.number} · ${formatDateAR(r.issueDate)} · ${
              r.partyName ?? "—"
            } · ${formatMoney(r.totalAmount.toString(), r.currency as "ARS" | "USD" | "EUR")}`,
          }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Movimientos</h2>
        <div className="overflow-x-auto border-y border-[var(--border)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-[var(--muted-foreground)]">
                <th className="py-3 pr-3 font-medium">Fecha</th>
                <th className="py-3 pr-3 font-medium">Propiedad</th>
                <th className="py-3 pr-3 font-medium">Detalle</th>
                <th className="py-3 pr-3 font-medium text-right">Debe</th>
                <th className="py-3 font-medium text-right">Haber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {stmt.entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-6 text-[var(--muted-foreground)]"
                  >
                    Sin movimientos.
                  </td>
                </tr>
              ) : (
                stmt.entries.map((m) => (
                  <tr key={`${m.kind}-${m.id}`}>
                    <td className="py-3 pr-3 tabular-nums text-[var(--muted-foreground)]">
                      {formatDateAR(m.date)}
                    </td>
                    <td className="py-3 pr-3">{m.propertyTitle}</td>
                    <td className="py-3 pr-3 text-[var(--muted-foreground)]">
                      {m.concept}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {m.amount > 0
                        ? formatMoney(
                            m.amount,
                            m.currency as "ARS" | "USD" | "EUR",
                          )
                        : "—"}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {m.amount < 0
                        ? formatMoney(
                            Math.abs(m.amount),
                            m.currency as "ARS" | "USD" | "EUR",
                          )
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
