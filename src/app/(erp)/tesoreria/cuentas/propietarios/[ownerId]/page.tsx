import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/session";
import { getOwnerAccountStatement } from "@/features/treasury/queries/account-statements";
import { formatMoney } from "@/features/treasury/lib/labels";
import { formatDateAR } from "@/lib/format-date";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ownerId: string }>;
};

export default async function CuentaPropietarioPage({ params }: PageProps) {
  await requireModule("tesoreria");
  const { ownerId } = await params;
  const stmt = await getOwnerAccountStatement(ownerId);
  if (!stmt) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={stmt.partyName}
        description="Cuenta corriente del propietario"
      />
      <p className="text-sm">
        <Link href="/tesoreria/cuentas" className="text-[var(--primary)] hover:underline">
          ← Cuentas corrientes
        </Link>
      </p>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="border-l-2 border-[var(--primary)] pl-3 sm:col-span-2 lg:col-span-1">
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">Saldo</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(stmt.balance, stmt.currency)}
          </dd>
        </div>
        {(
          [
            ["0–30", stmt.aging.b0_30],
            ["31–60", stmt.aging.b31_60],
            ["61–90", stmt.aging.b61_90],
            ["+90", stmt.aging.b90_plus],
          ] as const
        ).map(([label, amount]) => (
          <div key={label} className="border-l-2 border-[var(--border)] pl-3">
            <dt className="text-xs uppercase text-[var(--muted-foreground)]">
              {label} días
            </dt>
            <dd className="mt-1 text-xl tabular-nums">
              {formatMoney(amount, stmt.currency)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto border-y border-[var(--border)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-[var(--muted-foreground)]">
              <th className="py-3 pr-3 font-medium">Fecha</th>
              <th className="py-3 pr-3 font-medium">Documento</th>
              <th className="py-3 pr-3 font-medium">Detalle</th>
              <th className="py-3 pr-3 font-medium text-right">Debe</th>
              <th className="py-3 font-medium text-right">Haber</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {stmt.movements.map((m) => (
              <tr key={m.id}>
                <td className="py-3 pr-3 tabular-nums text-[var(--muted-foreground)]">
                  {formatDateAR(m.date)}
                </td>
                <td className="py-3 pr-3">
                  <Link
                    href={m.href}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    {m.number}
                  </Link>
                </td>
                <td className="py-3 pr-3 text-[var(--muted-foreground)]">
                  {m.description}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">
                  {m.debit > 0 ? formatMoney(m.debit, m.currency) : "—"}
                </td>
                <td className="py-3 text-right tabular-nums">
                  {m.credit > 0 ? formatMoney(m.credit, m.currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
