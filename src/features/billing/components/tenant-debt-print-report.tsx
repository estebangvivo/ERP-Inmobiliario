import { BILL_STATUS_LABELS } from "@/lib/labels";
import { formatDateAR } from "@/lib/format-date";
import { formatMoney } from "@/lib/money";
import type { BillStatus } from "@prisma/client";
import type { TenantDebtPrintData } from "@/features/billing/lib/tenant-debt-print-data";

const KIND_LABEL = {
  RENT: "Alquiler",
  SERVICES: "Servicios",
} as const;

function statusLabel(status: string): string {
  return BILL_STATUS_LABELS[status as BillStatus] ?? status;
}

export function TenantDebtPrintReport({ data }: { data: TenantDebtPrintData }) {
  const logoSrc = data.organizationLogoUrl?.split("?")[0] ?? null;
  const currencies = Object.keys(data.balanceByCurrency);

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
            Estado de deuda
          </p>
          <h1 className="font-display text-3xl tracking-tight">
            Cuenta corriente
          </h1>
        </div>
        <p className="text-sm text-[#78716c]">
          Emitido el {formatDateAR(data.issueDate)}
        </p>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wider text-[#78716c]">
            Inquilino
          </dt>
          <dd className="font-medium">{data.tenant.name}</dd>
          {data.tenant.documentNumber ? (
            <dd className="text-sm text-[#78716c]">
              DNI/CUIT: {data.tenant.documentNumber}
            </dd>
          ) : null}
          <dd className="text-sm text-[#78716c]">{data.tenant.email}</dd>
          {data.tenant.phone ? (
            <dd className="text-sm text-[#78716c]">{data.tenant.phone}</dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-[#78716c]">
            Saldo total adeudado
          </dt>
          <dd className="font-display text-2xl tabular-nums">
            {currencies.length === 0
              ? "Sin deuda"
              : currencies
                  .map((currency) =>
                    formatMoney(
                      String(data.balanceByCurrency[currency]),
                      currency as "ARS" | "USD" | "EUR",
                    ),
                  )
                  .join(" · ")}
          </dd>
        </div>
      </dl>

      {data.bills.length === 0 ? (
        <p className="mt-8 text-sm text-[#78716c]">
          No hay cuotas pendientes al momento de la emisión.
        </p>
      ) : (
        <section className="mt-8 space-y-6">
          <h2 className="text-xs uppercase tracking-wider text-[#78716c]">
            Cuotas pendientes
          </h2>

          {data.bills.map((bill) => (
            <div
              key={bill.id}
              className="border border-[#e7e5e4] rounded-md overflow-hidden"
            >
              <div className="bg-[#fafaf9] px-4 py-3 border-b border-[#e7e5e4]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{bill.installmentLabel}</p>
                    <p className="mt-0.5 text-xs text-[#78716c]">
                      {KIND_LABEL[bill.kind]} · {bill.contractCode} ·{" "}
                      {bill.propertyTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-[#78716c]">
                      Vence {formatDateAR(bill.dueDate)} ·{" "}
                      {statusLabel(bill.status)}
                      {bill.paidAmount > 0.001
                        ? ` · Pagado ${formatMoney(String(bill.paidAmount), bill.currency as "ARS" | "USD" | "EUR")}`
                        : ""}
                    </p>
                  </div>
                  <p className="font-display text-lg tabular-nums whitespace-nowrap">
                    {formatMoney(
                      String(bill.balance),
                      bill.currency as "ARS" | "USD" | "EUR",
                    )}
                  </p>
                </div>
              </div>

              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e7e5e4] text-xs uppercase tracking-wider text-[#78716c]">
                    <th className="py-2 px-4 font-medium">Concepto</th>
                    <th className="py-2 px-4 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.lines.map((line, index) => (
                    <tr
                      key={`${bill.id}-${line.label}-${index}`}
                      className="border-b border-[#f5f5f4]"
                    >
                      <td className="py-2 px-4">{line.label}</td>
                      <td className="py-2 px-4 text-right tabular-nums whitespace-nowrap">
                        {formatMoney(
                          String(line.amount),
                          bill.currency as "ARS" | "USD" | "EUR",
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#fafaf9] font-medium">
                    <td className="py-2.5 px-4">Subtotal cuota</td>
                    <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">
                      {formatMoney(
                        String(bill.balance),
                        bill.currency as "ARS" | "USD" | "EUR",
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          <div className="border-t border-[#d6d3d1] pt-4 space-y-2">
            {currencies.map((currency) => (
              <div
                key={currency}
                className="flex items-center justify-between font-display text-lg"
              >
                <span>Total adeudado ({currency})</span>
                <span className="tabular-nums">
                  {formatMoney(
                    String(data.balanceByCurrency[currency]),
                    currency as "ARS" | "USD" | "EUR",
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 border-t border-[#d6d3d1] pt-4 text-xs text-[#78716c]">
        Documento informativo de deuda pendiente. Los montos pueden variar
        hasta la fecha de pago por moras o ajustes.
      </footer>
    </article>
  );
}
