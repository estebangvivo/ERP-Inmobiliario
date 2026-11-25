import Link from "next/link";
import { Printer } from "lucide-react";
import { PageHeader } from "@/components/erp/page-chrome";
import { TenantLedgerPaymentPanel } from "@/components/erp/tenant-ledger-payment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import type { getTenantDebtDetail } from "@/server/services/tenant-ledger";

type Detail = NonNullable<Awaited<ReturnType<typeof getTenantDebtDetail>>>;

type BankAccountOption = {
  id: string;
  currency: string;
  label: string;
};

export function TenantLedgerDetail({
  detail,
  bankAccounts,
  printHref,
  backHref,
  backLabel = "Volver al listado",
}: {
  detail: Detail;
  bankAccounts: BankAccountOption[];
  printHref: string;
  backHref: string;
  backLabel?: string;
}) {
  const { tenant, bills, balanceByCurrency } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenant.name}
        description={`${tenant.email}${tenant.phone ? ` · ${tenant.phone}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {bills.length > 0 ? (
              <Link href={printHref}>
                <Button variant="outline" size="sm">
                  <Printer className="size-4" aria-hidden />
                  Imprimir deuda
                </Button>
              </Link>
            ) : null}
            <Link href={`/personas/${tenant.id}`}>
              <Button variant="outline" size="sm">
                Historial
              </Button>
            </Link>
            <Link href={backHref}>
              <Button variant="outline" size="sm">
                {backLabel}
              </Button>
            </Link>
          </div>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saldo total</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {Object.keys(balanceByCurrency).length === 0
            ? "Sin deuda"
            : Object.entries(balanceByCurrency)
                .map(([currency, amount]) =>
                  formatMoney(
                    String(amount),
                    currency as "ARS" | "USD" | "EUR",
                  ),
                )
                .join(" · ")}
        </CardContent>
      </Card>

      {bills.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Este inquilino no tiene cuotas abiertas.
        </p>
      ) : (
        <TenantLedgerPaymentPanel
          tenantId={tenant.id}
          bills={bills}
          bankAccounts={bankAccounts}
        />
      )}
    </div>
  );
}
