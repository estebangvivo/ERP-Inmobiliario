import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import { PaymentForm } from "@/components/erp/billing-forms";
import { LateFeeButton } from "@/components/erp/late-fee-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/dates";
import { BILL_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { billScopeWhere } from "@/lib/tenant-scope";
import { syncBillOverdueState } from "@/server/services/billing";

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
        title={`Cuota ${bill.periodMonth}/${bill.periodYear}`}
        description={`${bill.contract.code} · ${bill.contract.property.title}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                bill.status === "OVERDUE"
                  ? "danger"
                  : bill.status === "PAID"
                    ? "success"
                    : "secondary"
              }
            >
              {BILL_STATUS_LABELS[bill.status]}
            </Badge>
            {staff ? <LateFeeButton billId={bill.id} /> : null}
            <a href={`/api/cobros/${bill.id}/pdf`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                Descargar recibo PDF
              </Button>
            </a>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Alquiler" value={formatMoney(bill.rentAmount.toString(), bill.currency)} />
        <Stat label="Expensas" value={formatMoney(bill.expensesAmount.toString(), bill.currency)} />
        <Stat label="Mora" value={formatMoney(bill.lateFeeAmount.toString(), bill.currency)} />
        <Stat label="Saldo" value={formatMoney(String(balance), bill.currency)} />
      </div>

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
