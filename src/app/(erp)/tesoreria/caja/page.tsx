import Link from "next/link";
import { requireModule, isStaffRole } from "@/lib/session";
import { getCashOverview } from "@/features/treasury/queries/cash-queries";
import { OpenCashSessionForm } from "@/features/treasury/components/open-cash-session-form";
import { formatCashMoney } from "@/features/treasury/lib/cash-labels";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

export default async function CajaPage() {
  const session = await requireModule("tesoreria");
  const overview = await getCashOverview("ARS");
  const canManage = isStaffRole(session.organizationRole);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja"
        description="Caja diaria operativa y caja tesorería."
      />

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="border-l-2 border-[var(--primary)] pl-3">
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">Caja diaria</dt>
          <dd className="text-2xl font-semibold">
            {formatCashMoney(overview.daily.balance, overview.daily.currency)}
          </dd>
        </div>
        <div className="border-l-2 border-emerald-600 pl-3">
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">Tesorería</dt>
          <dd className="text-2xl font-semibold">
            {formatCashMoney(overview.treasury.balance, overview.treasury.currency)}
          </dd>
          <dd className="text-sm">
            <Link href="/tesoreria/caja/tesoreria" className="text-[var(--primary)]">
              Ver movimientos
            </Link>
          </dd>
        </div>
      </dl>

      {canManage && !overview.openSession ? (
        <OpenCashSessionForm currency="ARS" />
      ) : null}

      {overview.openSession ? (
        <div className="rounded-lg border p-4">
          <p className="font-medium">Sesión abierta: {overview.openSession.number}</p>
          <Link
            href={`/tesoreria/caja/sesiones/${overview.openSession.id}`}
            className="text-sm text-[var(--primary)]"
          >
            Ver sesión →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
