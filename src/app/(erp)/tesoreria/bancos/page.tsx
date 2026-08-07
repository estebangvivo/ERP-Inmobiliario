import Link from "next/link";
import { requireModule } from "@/lib/session";
import { listBankAccounts } from "@/features/treasury/queries/bank-queries";
import { formatMoney } from "@/features/treasury/lib/labels";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

export default async function BancosPage() {
  await requireModule("tesoreria");
  const accounts = await listBankAccounts({ activeOnly: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bancos"
        description="Cuentas bancarias y saldos."
        actions={
          <Link href="/tesoreria/bancos/depositar">
            <Button size="sm" variant="outline">
              Depositar
            </Button>
          </Link>
        }
      />
      <ul className="divide-y divide-[var(--border)] border-y">
        {accounts.map((a) => (
          <li key={a.id}>
            <Link
              href={`/tesoreria/bancos/${a.id}`}
              className="flex items-center justify-between py-4 hover:bg-[var(--muted)]/40"
            >
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-sm text-[var(--muted-foreground)]">{a.bankName}</p>
              </div>
              <p className="font-medium tabular-nums">
                {formatMoney(a.balance, a.currency)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
