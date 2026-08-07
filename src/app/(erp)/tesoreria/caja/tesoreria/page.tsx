import Link from "next/link";
import { requireModule, isStaffRole } from "@/lib/session";
import { getCashOverview } from "@/features/treasury/queries/cash-queries";
import { TreasuryCashForm } from "@/features/treasury/components/treasury-cash-form";
import { formatCashMoney } from "@/features/treasury/lib/cash-labels";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

export default async function CajaTesoreriaPage() {
  const auth = await requireModule("tesoreria");
  const overview = await getCashOverview("ARS");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja tesorería"
        description={`Saldo: ${formatCashMoney(overview.treasury.balance, overview.treasury.currency)}`}
      />
      <p className="text-sm">
        <Link href="/tesoreria/caja" className="text-[var(--primary)]">
          ← Caja
        </Link>
      </p>
      <TreasuryCashForm
        currency="ARS"
        canManage={isStaffRole(auth.organizationRole)}
      />
      <ul className="divide-y divide-[var(--border)] border-y">
        {overview.treasuryMovements.map((m) => (
          <li key={m.id} className="flex justify-between py-3 text-sm">
            <span>{m.description}</span>
            <span className="tabular-nums">
              {formatCashMoney(m.amount, overview.treasury.currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
