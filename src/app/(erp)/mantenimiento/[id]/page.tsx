import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import {
  PaySupplierInvoiceForm,
  SupplierInvoiceForm,
  WorkOrderStatusButtons,
} from "@/components/erp/work-order-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/dates";
import { COST_BEARER_LABELS, WORK_ORDER_STATUS_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { listOrgPeople } from "@/server/queries/org-people";
import { prisma } from "@/lib/prisma";
import { isStaffRole, requireModule } from "@/lib/session";
import { workOrderScopeWhere } from "@/lib/tenant-scope";

type Params = Promise<{ id: string }>;

export default async function WorkOrderDetailPage({ params }: { params: Params }) {
  const session = await requireModule("mantenimiento");
  const staff = isStaffRole(session.organizationRole);
  const { id } = await params;

  const [workOrder, suppliers, bankAccounts] = await Promise.all([
    prisma.workOrder.findFirst({
      where: { id, AND: [workOrderScopeWhere(session)] },
      include: {
        property: true,
        assignee: true,
        invoices: { include: { supplier: true }, orderBy: { invoiceDate: "desc" } },
      },
    }),
    staff
      ? listOrgPeople(session.organizationId, ["SUPPLIER"])
      : Promise.resolve([]),
    prisma.bankAccount.findMany({
      where: {
        organizationId: session.organizationId!,
        isActive: true,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, bankName: true, currency: true },
    }),
  ]);

  if (!workOrder) notFound();

  const bankOpts = bankAccounts.map((b) => ({
    id: b.id,
    currency: b.currency,
    label: `${b.name} · ${b.bankName} (${b.currency})`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={workOrder.code}
        description={`${workOrder.title} · ${workOrder.property.title}`}
        actions={
          <Badge variant="secondary">
            {WORK_ORDER_STATUS_LABELS[workOrder.status]}
          </Badge>
        }
      />

      {staff ? (
        <WorkOrderStatusButtons id={workOrder.id} status={workOrder.status} />
      ) : null}

      {workOrder.description ? (
        <p className="text-sm text-[var(--muted-foreground)]">{workOrder.description}</p>
      ) : null}

      {staff ? (
        <SupplierInvoiceForm
          workOrderId={workOrder.id}
          suppliers={suppliers}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facturas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workOrder.invoices.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Sin facturas.</p>
          ) : (
            workOrder.invoices.map((inv) => (
              <div
                key={inv.id}
                className="border-b border-[var(--border)] py-2 text-sm last:border-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {formatMoney(inv.amount.toString(), inv.currency)} ·{" "}
                      {inv.supplier.name}
                      {inv.paidAt ? (
                        <span className="ml-2 text-xs text-emerald-700">Pagada</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatDateOnly(inv.invoiceDate)} ·{" "}
                      {COST_BEARER_LABELS[inv.costBearer]}
                      {inv.invoiceNumber ? ` · ${inv.invoiceNumber}` : ""}
                    </p>
                  </div>
                </div>
                {staff && !inv.paidAt ? (
                  <PaySupplierInvoiceForm
                    invoiceId={inv.id}
                    amountLabel={formatMoney(inv.amount.toString(), inv.currency)}
                    currency={inv.currency}
                    bankAccounts={bankOpts}
                  />
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
