import {
  formatMoney,
  PAYMENT_METHOD_LABEL,
  TREASURY_STATUS_LABEL,
} from "@/features/treasury/lib/labels";
import { formatDateAR } from "@/lib/format-date";
import type { TreasuryPaymentMethod, TreasuryDocStatus } from "@prisma/client";

export type PrintReportPayment = {
  method: TreasuryPaymentMethod;
  amount: number;
  checkNumber?: string | null;
  checkBank?: string | null;
  isElectronicCheck?: boolean;
  bankAccountName?: string | null;
};

export type PrintReportLine = {
  description: string;
  contractLabel?: string | null;
  propertyLabel?: string | null;
  amount: number;
};

export type PrintReportData = {
  kind: "receipt" | "payment-order";
  number: string;
  status: TreasuryDocStatus;
  issueDate: Date | string;
  partyName: string;
  partyTaxId?: string | null;
  totalAmount: number;
  currency: string;
  concept?: string | null;
  notes?: string | null;
  organizationName: string;
  organizationTaxId?: string | null;
  organizationAddress?: string | null;
  organizationLogoUrl?: string | null;
  payments: PrintReportPayment[];
  lines: PrintReportLine[];
};

export function TreasuryPrintReport({ data }: { data: PrintReportData }) {
  const title = data.kind === "receipt" ? "Recibo" : "Orden de pago";
  const partyLabel = data.kind === "receipt" ? "Inquilino" : "Beneficiario";
  const logoSrc = data.organizationLogoUrl?.split("?")[0] ?? null;

  return (
    <article className="mx-auto max-w-3xl bg-white px-6 py-8 text-[#1c1917] shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none">
      <header className="flex items-start gap-4 border-b border-[#d6d3d1] pb-5">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt=""
            className="h-14 w-auto max-w-[140px] object-contain"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl tracking-tight">
            {data.organizationName}
          </p>
          {data.organizationTaxId ? (
            <p className="mt-0.5 text-sm text-[#78716c]">
              CUIT: {data.organizationTaxId}
            </p>
          ) : null}
          {data.organizationAddress ? (
            <p className="mt-0.5 text-sm text-[#78716c]">
              {data.organizationAddress}
            </p>
          ) : null}
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-[#78716c]">
            {title}
          </p>
          <h1 className="font-display text-3xl tracking-tight">{data.number}</h1>
        </div>
        <p className="text-sm text-[#78716c]">
          {TREASURY_STATUS_LABEL[data.status]} · {formatDateAR(data.issueDate)}
        </p>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wider text-[#78716c]">
            {partyLabel}
          </dt>
          <dd className="font-medium">{data.partyName}</dd>
          {data.partyTaxId ? (
            <dd className="text-sm text-[#78716c]">CUIT: {data.partyTaxId}</dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-[#78716c]">
            Total
          </dt>
          <dd className="font-display text-2xl tabular-nums">
            {formatMoney(data.totalAmount, data.currency)}
          </dd>
        </div>
        {data.concept ? (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wider text-[#78716c]">
              Concepto
            </dt>
            <dd>{data.concept}</dd>
          </div>
        ) : null}
      </dl>

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-wider text-[#78716c]">
          Medios de pago
        </h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.payments.map((p, i) => {
            const parts = [
              PAYMENT_METHOD_LABEL[p.method],
              formatMoney(p.amount, data.currency),
            ];
            if (p.method === "CHECK" && (p.checkNumber || p.checkBank)) {
              parts.push(
                [
                  p.isElectronicCheck ? "Electrónico" : null,
                  p.checkNumber,
                  p.checkBank,
                ]
                  .filter(Boolean)
                  .join(" · "),
              );
            }
            if (p.method === "TRANSFER" && p.bankAccountName) {
              parts.push(p.bankAccountName);
            }
            return (
              <li key={`${p.method}-${i}`}>
                {parts.join(" · ")}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-wider text-[#78716c]">
          Detalle
        </h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#d6d3d1] text-xs uppercase tracking-wider text-[#78716c]">
              <th className="py-2 pr-3 font-medium">Descripción</th>
              <th className="py-2 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, i) => (
              <tr key={i} className="border-b border-[#e7e5e4] align-top">
                <td className="py-2.5 pr-3">
                  <p>{line.description || "—"}</p>
                  {[line.contractLabel, line.propertyLabel]
                    .filter(Boolean)
                    .length > 0 ? (
                    <p className="mt-0.5 text-xs text-[#78716c]">
                      {[line.contractLabel, line.propertyLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </td>
                <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                  {formatMoney(line.amount, data.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 font-medium">Total</td>
              <td className="pt-4 text-right font-display text-lg tabular-nums">
                {formatMoney(data.totalAmount, data.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {data.notes ? (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider text-[#78716c]">
            Notas
          </h2>
          <p className="mt-1 text-sm text-[#57534e]">{data.notes}</p>
        </section>
      ) : null}
    </article>
  );
}
