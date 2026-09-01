import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/session";
import {
  getReceiptById,
  hasBankMovementForDoc,
  hasCashMovementForDoc,
} from "@/features/treasury/queries/list-treasury";
import { listBankAccounts } from "@/features/treasury/queries/bank-queries";
import { TreasuryDocActions } from "@/features/treasury/components/treasury-doc-actions";
import {
  formatMoney,
  PAYMENT_METHOD_LABEL,
  TREASURY_STATUS_LABEL,
  TREASURY_STATUS_STYLE,
} from "@/features/treasury/lib/labels";
import { formatDateAR } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/erp/page-chrome";

type PageProps = { params: Promise<{ id: string }> };

export default async function ReciboDetailPage({ params }: PageProps) {
  await requireModule("tesoreria");
  const { id } = await params;
  const doc = await getReceiptById(id);
  if (!doc) notFound();

  const [hasCashMovement, hasBankMovement, bankAccounts] = await Promise.all([
    hasCashMovementForDoc({ receiptId: id }),
    hasBankMovementForDoc({ receiptId: id }),
    listBankAccounts({ activeOnly: true }),
  ]);

  const hasTransferPayment = doc.payments.some((p) => p.method === "TRANSFER");
  const transferMissingBankAccount = doc.payments.some(
    (p) => p.method === "TRANSFER" && !p.bankAccountId,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={doc.number}
        description={`${TREASURY_STATUS_LABEL[doc.status]} · ${formatDateAR(doc.issueDate)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/tesoreria/recibos/${doc.id}/print`}>
              <Button size="sm" variant="outline">
                Imprimir
              </Button>
            </Link>
            <TreasuryDocActions
              kind="receipt"
              id={doc.id}
              status={doc.status}
              paymentMethod={doc.paymentMethod}
              hasCashMovement={hasCashMovement}
              hasBankMovement={hasBankMovement}
              hasTransferPayment={hasTransferPayment}
              transferMissingBankAccount={
                transferMissingBankAccount ||
                (doc.paymentMethod === "TRANSFER" && doc.payments.length === 0)
              }
              bankAccounts={bankAccounts.map((b) => ({
                id: b.id,
                name: b.name,
                bankName: b.bankName,
              }))}
            />
          </div>
        }
      />

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">Inquilino</dt>
          <dd className="font-medium">{doc.tenant?.name ?? doc.partyName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">Total</dt>
          <dd className="text-xl font-semibold">
            {formatMoney(Number(doc.totalAmount), doc.currency)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase text-[var(--muted-foreground)]">Concepto</dt>
          <dd>{doc.concept ?? "—"}</dd>
        </div>
      </dl>

      <section>
        <h2 className="mb-3 font-medium">Líneas</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-[var(--muted-foreground)]">
                <th className="py-2 pr-3">Descripción</th>
                <th className="py-2 pr-3">Contrato</th>
                <th className="py-2 pr-3">Propiedad</th>
                <th className="py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line) => (
                <tr key={line.id} className="border-b border-[var(--border)]/70">
                  <td className="py-3 pr-3">{line.description}</td>
                  <td className="py-3 pr-3">{line.contract?.code ?? "—"}</td>
                  <td className="py-3 pr-3">{line.property?.title ?? "—"}</td>
                  <td className="py-3 text-right tabular-nums">
                    {formatMoney(Number(line.amount), doc.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Medios de pago</h2>
        <ul className="space-y-1 text-sm">
          {(doc.payments.length > 0 ? doc.payments : []).map((p) => (
            <li key={p.id}>
              {PAYMENT_METHOD_LABEL[p.method]} ·{" "}
              {formatMoney(Number(p.amount), doc.currency)}
              {p.bankAccount
                ? ` · ${p.bankAccount.name}${p.bankAccount.bankName ? ` (${p.bankAccount.bankName})` : ""}`
                : null}
            </li>
          ))}
        </ul>
      </section>

      <Link href="/tesoreria/recibos" className="text-sm text-[var(--primary)]">
        ← Volver a recibos
      </Link>
    </div>
  );
}
