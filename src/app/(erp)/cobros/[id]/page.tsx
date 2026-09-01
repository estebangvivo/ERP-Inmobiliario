import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import { PaymentForm } from "@/components/erp/billing-forms";
import { LateFeeButton } from "@/components/erp/late-fee-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/dates";
import { formatInstallmentLabel } from "@/features/billing/lib/installment-label";
import { TENANT_BILL_KIND_LABELS } from "@/features/billing/lib/tenant-bill-kind";
import { BILL_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { billScopeWhere } from "@/lib/tenant-scope";
import { syncBillOverdueState } from "@/server/services/billing";
import { getBillContractServiceLinesForDisplay } from "@/server/services/contract-services-billing";

type Params = Promise<{ id: string }>;

export default async function CobroDetailPage({ params }: { params: Params }) {
  const session = await requireModule("cobros");
  const staff = isStaffRole(session.organizationRole);
  const { id } = await params;

  await syncBillOverdueState(id);

  const bill = await prisma.tenantBill.findFirst({
    where: { id, AND: [billScopeWhere(session)] },
    include: {
      contract: { include: { property: true } },
      payments: { orderBy: { paidAt: "desc" }, include: { recordedBy: true } },
    },
  });
  if (!bill) notFound();

  const isServices = bill.kind === "SERVICES";
  const serviceLines = isServices
    ? await getBillContractServiceLinesForDisplay(bill.id)
    : [];
  const balance = Number(bill.totalAmount) - Number(bill.paidAmount);

  const bankAccounts = staff
    ? await prisma.bankAccount.findMany({
        where: {
          organizationId: session.organizationId!,
          isActive: true,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, bankName: true, currency: true },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${TENANT_BILL_KIND_LABELS[bill.kind]} · ${formatInstallmentLabel({
          contractStart: bill.contract.startDate,
          contractEnd: bill.contract.endDate,
          periodYear: bill.periodYear,
          periodMonth: bill.periodMonth,
        })}`}
        description={`${bill.contract.code} · ${bill.contract.property.title}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isServices ? "warning" : "secondary"}>
              {TENANT_BILL_KIND_LABELS[bill.kind]}
            </Badge>
            <Badge
              variant={
                bill.status === "OVERDUE"
                  ? "danger"
                  : bill.status === "PAID"
                    ? "success"
                    : "secondary"
              }
              data-testid="bill-status"
            >
              {BILL_STATUS_LABELS[bill.status]}
            </Badge>
            {staff ? <LateFeeButton billId={bill.id} /> : null}
            <a href={`/api/cobros/${bill.id}/pdf`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                Descargar PDF
              </Button>
            </a>
          </div>
        }
      />

      {isServices ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat
              label="Servicios"
              value={formatMoney(bill.contractServicesAmount.toString(), bill.currency)}
            />
            <Stat label="Mora" value={formatMoney(bill.lateFeeAmount.toString(), bill.currency)} />
            <Stat label="Saldo" value={formatMoney(String(balance), bill.currency)} />
          </div>
          {serviceLines.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalle de servicios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {serviceLines.map((line) => (
                  <div
                    key={line.contractServiceId}
                    className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0"
                  >
                    <div>
                      <p className="font-medium">{line.concept}</p>
                      {line.isOverride ? (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Ajuste puntual
                        </p>
                      ) : null}
                    </div>
                    <span className="font-semibold">
                      {formatMoney(String(line.amount), bill.currency)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Stat label="Alquiler" value={formatMoney(bill.rentAmount.toString(), bill.currency)} />
          <Stat label="Expensas" value={formatMoney(bill.expensesAmount.toString(), bill.currency)} />
          <Stat label="Mora" value={formatMoney(bill.lateFeeAmount.toString(), bill.currency)} />
          <Stat label="Saldo" value={formatMoney(String(balance), bill.currency)} />
        </div>
      )}

      <p className="text-sm text-[var(--muted-foreground)]">
        Vencimiento: {formatDateOnly(bill.dueDate)} · Total{" "}
        {formatMoney(bill.totalAmount.toString(), bill.currency)}
      </p>

      {staff ? (
        <PaymentForm
          billId={bill.id}
          balance={balance}
          currency={bill.currency}
          bankAccounts={bankAccounts.map((b) => ({
            id: b.id,
            currency: b.currency,
            label: `${b.name} · ${b.bankName} (${b.currency})`,
          }))}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagos registrados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bill.payments.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Sin pagos aún.</p>
          ) : (
            bill.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm last:border-0"
              >
                <div>
                  <p className="font-medium">
                    {formatMoney(p.amount.toString(), p.currency)}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {PAYMENT_METHOD_LABELS[p.method]} · {formatDateOnly(p.paidAt)}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">
                  {p.recordedBy?.name ?? "Sistema"}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
