import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import { TenantLedgerPaymentPanel } from "@/components/erp/tenant-ledger-payment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { syncOverdueBills } from "@/server/services/billing";
import { getTenantDebtDetail } from "@/server/services/tenant-ledger";

type Params = Promise<{ tenantId: string }>;

export default async function TesoreriaCuentaInquilinoPage({
  params,
}: {
  params: Params;
}) {
  const session = await requireModule("tesoreria");
  if (!isStaffRole(session.organizationRole)) {
    redirect("/tesoreria");
  }

  const { tenantId } = await params;
  await syncOverdueBills(session.organizationId);

  const detail = await getTenantDebtDetail(
    session.organizationId,
    tenantId,
  );
  if (!detail) notFound();

  const { tenant, bills, balanceByCurrency } = detail;

  const bankRows = await prisma.bankAccount.findMany({
    where: { organizationId: session.organizationId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, bankName: true, currency: true },
  });
  const bankAccounts = bankRows.map((b) => ({
    id: b.id,
    currency: b.currency,
    label: `${b.name} · ${b.bankName} (${b.currency})`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenant.name}
        description={`${tenant.email}${tenant.phone ? ` · ${tenant.phone}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/personas/${tenant.id}`}>
              <Button variant="outline" size="sm">
                Historial
              </Button>
            </Link>
            <Link href="/tesoreria/cuentas">
              <Button variant="outline" size="sm">
                Volver al listado
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
