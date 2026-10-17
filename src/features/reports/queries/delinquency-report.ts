import { requireStaff } from "@/lib/session";
import { listTenantAccountSummaries } from "@/features/treasury/queries/account-statements";
import { listTenantsWithDebt } from "@/server/services/tenant-ledger";
import { sumByCurrency } from "@/config/currencies";
import type { AgingSummary } from "@/features/treasury/queries/account-statements";

export type DelinquencyRow = {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  openBills: number;
  balance: number;
  currency: string;
  balanceByCurrency: Record<string, number>;
  oldestDueDate: string | null;
  aging: AgingSummary;
};

export type DelinquencyReport = {
  rows: DelinquencyRow[];
  totalByCurrency: Record<string, number>;
  agingTotals: AgingSummary;
};

function emptyAging(): AgingSummary {
  return { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 };
}

export async function getDelinquencyReport(): Promise<DelinquencyReport> {
  const session = await requireStaff();
  const [debtRows, summaries] = await Promise.all([
    listTenantsWithDebt(session.organizationId),
    listTenantAccountSummaries(),
  ]);

  const agingByTenant = new Map(
    summaries.map((s) => [s.id, s.aging] as const),
  );

  const rows: DelinquencyRow[] = debtRows.map((r) => {
    const primaryCurrency =
      Object.entries(r.balanceByCurrency).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "ARS";
    const balance = Object.values(r.balanceByCurrency).reduce(
      (acc, n) => acc + n,
      0,
    );
    return {
      tenantId: r.tenantId,
      tenantName: r.tenantName,
      tenantEmail: r.tenantEmail,
      openBills: r.openBills,
      balance,
      currency: primaryCurrency,
      balanceByCurrency: r.balanceByCurrency,
      oldestDueDate: r.oldestDueDate?.toISOString() ?? null,
      aging: agingByTenant.get(r.tenantId) ?? emptyAging(),
    };
  });

  const agingTotals = emptyAging();
  for (const row of rows) {
    agingTotals.b0_30 += row.aging.b0_30;
    agingTotals.b31_60 += row.aging.b31_60;
    agingTotals.b61_90 += row.aging.b61_90;
    agingTotals.b90_plus += row.aging.b90_plus;
  }

  return {
    rows,
    totalByCurrency: sumByCurrency(
      rows.flatMap((r) =>
        Object.entries(r.balanceByCurrency).map(([currency, amount]) => ({
          currency,
          amount,
        })),
      ),
    ),
    agingTotals: {
      b0_30: Math.round(agingTotals.b0_30 * 100) / 100,
      b31_60: Math.round(agingTotals.b31_60 * 100) / 100,
      b61_90: Math.round(agingTotals.b61_90 * 100) / 100,
      b90_plus: Math.round(agingTotals.b90_plus * 100) / 100,
    },
  };
}
