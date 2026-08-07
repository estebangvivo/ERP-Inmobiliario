import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule, isStaffRole } from "@/lib/session";
import { getCashSessionById } from "@/features/treasury/queries/cash-queries";
import { CashSessionControls } from "@/features/treasury/components/cash-session-controls";
import { formatCashMoney } from "@/features/treasury/lib/cash-labels";
import { PageHeader } from "@/components/erp/page-chrome";

type PageProps = { params: Promise<{ sessionId: string }> };

export default async function CajaSesionPage({ params }: PageProps) {
  const auth = await requireModule("tesoreria");
  const { sessionId } = await params;
  const session = await getCashSessionById(sessionId);
  if (!session) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={session.number} description="Sesión de caja diaria" />
      <p className="text-sm">
        <Link href="/tesoreria/caja" className="text-[var(--primary)]">
          ← Caja
        </Link>
      </p>
      <CashSessionControls
        session={session}
        canManage={isStaffRole(auth.organizationRole)}
      />
      <ul className="divide-y divide-[var(--border)] border-y">
        {session.movements.map((m) => (
          <li key={m.id} className="flex justify-between py-3 text-sm">
            <span>{m.description}</span>
            <span className="tabular-nums">
              {formatCashMoney(m.amount, session.currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
