import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule, isStaffRole } from "@/lib/session";
import { getBankAccountDetail } from "@/features/treasury/queries/bank-queries";
import { BankAdjustmentForm } from "@/features/treasury/components/bank-adjustment-form";
import { formatMoney } from "@/features/treasury/lib/labels";
import { PageHeader } from "@/components/erp/page-chrome";

type PageProps = { params: Promise<{ id: string }> };

export default async function BancoDetailPage({ params }: PageProps) {
  const session = await requireModule("tesoreria");
  const { id } = await params;
  const detail = await getBankAccountDetail(id);
  if (!detail) notFound();
  const { account, movements } = detail;

  return (
    <div className="space-y-6">
      <PageHeader title={account.name} description={account.bankName} />
      <p className="text-xl font-semibold tabular-nums">
        {formatMoney(account.balance, account.currency)}
      </p>
      <BankAdjustmentForm
        bankAccountId={account.id}
        canManage={isStaffRole(session.organizationRole)}
      />
      <ul className="divide-y divide-[var(--border)] border-y text-sm">
        {movements.slice(0, 50).map((m) => (
          <li key={m.id} className="flex justify-between gap-4 py-2">
            <span>{m.description}</span>
            <span className="tabular-nums">
              {formatMoney(m.amount, account.currency)}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/tesoreria/bancos" className="text-sm text-[var(--primary)]">
        ← Bancos
      </Link>
    </div>
  );
}
