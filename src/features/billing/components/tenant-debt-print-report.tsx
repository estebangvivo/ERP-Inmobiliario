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
  return (
    BILL_STATUS_LABELS[status as BillStatus] ?? status
  );
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
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider text-[#78716c]">
            Cuotas pendientes
          </h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d6d3d1] text-xs uppercase tracking-wider text-[#78716c]">
                <th className="py-2 pr-3 font-medium">Cuota</th>
                <th className="py-2 pr-3 font-medium">Propiedad</th>
                <th className="py-2 pr-3 font-medium">Vencimiento</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {data.bills.map((bill) => (
                <tr
                  key={`${bill.contractCode}-${bill.installmentLabel}-${bill.dueDate.toISOString()}`}
                  className="border-b border-[#e7e5e4] align-top"
                >
                  <td className="py-2.5 pr-3">
                    <p>{bill.installmentLabel}</p>
                    <p className="mt-0.5 text-xs text-[#78716c]">
                      {KIND_LABEL[bill.kind]} · {bill.contractCode}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3">{bill.propertyTitle}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    {formatDateAR(bill.dueDate)}
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    {statusLabel(bill.status)}
                    {bill.paidAmount > 0.001 ? (
                      <p className="mt-0.5 text-xs text-[#78716c]">
                        Pagado:{" "}
                        {formatMoney(
                          String(bill.paidAmount),
                          bill.currency as "ARS" | "USD" | "EUR",
                        )}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                    {formatMoney(
                      String(bill.balance),
                      bill.currency as "ARS" | "USD" | "EUR",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {currencies.map((currency) => (
                <tr key={currency}>
                  <td colSpan={4} className="pt-4 font-medium">
                    Total adeudado ({currency})
                  </td>
                  <td className="pt-4 text-right font-display text-lg tabular-nums">
                    {formatMoney(
                      String(data.balanceByCurrency[currency]),
                      currency as "ARS" | "USD" | "EUR",
                    )}
                  </td>
                </tr>
              ))}
            </tfoot>
          </table>
        </section>
      )}

      <footer className="mt-10 border-t border-[#d6d3d1] pt-4 text-xs text-[#78716c]">
        Documento informativo de deuda pendiente. Los montos pueden variar
        hasta la fecha de pago por moras o ajustes.
      </footer>
    </article>
  );
}
