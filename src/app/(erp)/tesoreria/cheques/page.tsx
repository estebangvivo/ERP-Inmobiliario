import Link from "next/link";
import { requireModule } from "@/lib/session";
import { listChecks } from "@/features/treasury/queries/list-checks";
import { formatMoney, CHECK_STATUS_LABEL } from "@/features/treasury/lib/labels";
import { formatDateAR } from "@/lib/format-date";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

export default async function ChequesPage() {
  await requireModule("tesoreria");
  const checks = await listChecks({ status: "ALL", kind: "ALL" });

  return (
    <div className="space-y-6">
      <PageHeader title="Cheques" description="Cartera, entregados y rechazados." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-[var(--muted-foreground)]">
              <th className="py-2 pr-3">Número</th>
              <th className="py-2 pr-3">Banco</th>
              <th className="py-2 pr-3">Vencimiento</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.id} className="border-b border-[var(--border)]/70">
                <td className="py-3 pr-3">{c.number}</td>
                <td className="py-3 pr-3">{c.bank}</td>
                <td className="py-3 pr-3">
                  {c.dueDate ? formatDateAR(c.dueDate) : "—"}
                </td>
                <td className="py-3 pr-3">{CHECK_STATUS_LABEL[c.status]}</td>
                <td className="py-3 text-right tabular-nums">
                  {formatMoney(c.amount, c.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/tesoreria" className="text-sm text-[var(--primary)]">
        ← Tesorería
      </Link>
    </div>
  );
}
