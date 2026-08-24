import Link from "next/link";
import { requireModule, isStaffRole } from "@/lib/session";
import { listBankAccounts } from "@/features/treasury/queries/bank-queries";
import { listChecks } from "@/features/treasury/queries/list-checks";
import { getCashOverview } from "@/features/treasury/queries/cash-queries";
import { getEnabledCurrencies } from "@/features/settings/queries/get-organization";
import { BankDepositForm } from "@/features/treasury/components/bank-deposit-form";
import { formatMoney } from "@/features/treasury/lib/labels";
import { formatDateAR } from "@/lib/format-date";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ bankId?: string }>;
};

export default async function DepositarPage({ searchParams }: PageProps) {
  const session = await requireModule("tesoreria");
  const { bankId } = await searchParams;

  const [banks, checksResult, enabledCurrencies] = await Promise.all([
    listBankAccounts({ activeOnly: true }),
    listChecks({ status: "IN_PORTFOLIO" }),
    getEnabledCurrencies(),
  ]);
  const checks = checksResult.items;

  const overviews = await Promise.all(
    enabledCurrencies.map(async (currency) => ({
      currency,
      overview: await getCashOverview(currency),
    })),
  );

  const dailyBalances: Record<string, number> = {};
  const treasuryBalances: Record<string, number> = {};
  for (const { currency, overview } of overviews) {
    dailyBalances[currency] = overview.daily.balance;
    treasuryBalances[currency] = overview.treasury.balance;
  }

  const defaultBankId =
    bankId && banks.some((b) => b.id === bankId) ? bankId : "";

  return (
    <div className="space-y-6">
      <PageHeader title="Depositar" description="Depósito bancario de efectivo o cheques." />
      <p className="text-sm">
        <Link href="/tesoreria/bancos" className="text-[var(--primary)]">
          ← Bancos
        </Link>
      </p>
      <BankDepositForm
        canManage={isStaffRole(session.organizationRole)}
        defaultBankId={defaultBankId}
        dailyBalances={dailyBalances}
        treasuryBalances={treasuryBalances}
        banks={banks.map((b) => ({
          id: b.id,
          name: b.name,
          bankName: b.bankName,
          currency: b.currency,
          balance: b.balance,
          label: `${b.name} · ${b.bankName} (${b.currency})`,
        }))}
        checks={checks.map((c) => ({
          id: c.id,
          number: c.number,
          bank: c.bank,
          amount: c.amount,
          currency: c.currency,
          dueDate: c.dueDate ? formatDateAR(c.dueDate) : null,
          label: `${c.number} · ${c.bank} · ${formatMoney(c.amount, c.currency)}`,
        }))}
      />
    </div>
  );
}
