import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { sumByCurrency } from "@/config/currencies";
import { COST_BEARER_LABELS } from "@/lib/labels";
import type { ReportDateRange } from "@/features/reports/lib/date-range";

function toNumber(value: { toNumber(): number } | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type RecoverableInvoiceRow = {
  id: string;
  workOrderId: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  amount: number;
  currency: string;
  paidAt: string | null;
  paidToSupplier: boolean;
  pendingRecovery: boolean;
  supplierName: string;
  workOrderCode: string;
  workOrderTitle: string;
  propertyTitle: string;
  contractCode: string | null;
  costBearerLabel: string;
};

export type RecoverableWorkOrderRow = {
  id: string;
  code: string;
  title: string;
  requestedAt: string;
  status: string;
  propertyTitle: string;
  contractCode: string | null;
  assigneeName: string | null;
};

export type RecoverableExpensesReport = {
  range: ReportDateRange;
  invoices: RecoverableInvoiceRow[];
  totalByCurrency: Record<string, number>;
  paidByCurrency: Record<string, number>;
  pendingPaymentByCurrency: Record<string, number>;
  pendingRecoveryByCurrency: Record<string, number>;
  workOrdersWithoutInvoice: RecoverableWorkOrderRow[];
};

export async function getRecoverableExpensesReport(
  range: ReportDateRange,
): Promise<RecoverableExpensesReport> {
  const session = await requireStaff();
  const orgId = session.organizationId;
  const { from, to } = range;

  const [invoices, workOrdersWithoutInvoice] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where: {
        costBearer: "AGENCY_RECOVERABLE",
        invoiceDate: { gte: from, lte: to },
        workOrder: { organizationId: orgId },
      },
      include: {
        supplier: { select: { name: true } },
        workOrder: {
          select: {
            code: true,
            title: true,
            property: { select: { title: true } },
            contract: { select: { code: true } },
          },
        },
        paymentOrderApps: {
          where: { paymentOrder: { status: "POSTED" } },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { invoiceDate: "desc" },
    }),
    prisma.workOrder.findMany({
      where: {
        organizationId: orgId,
        costBearer: "AGENCY_RECOVERABLE",
        status: { not: "CANCELLED" },
        requestedAt: { gte: from, lte: to },
        invoices: { none: {} },
      },
      include: {
        property: { select: { title: true } },
        contract: { select: { code: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { requestedAt: "desc" },
      take: 200,
    }),
  ]);

  const rows: RecoverableInvoiceRow[] = invoices.map((inv) => {
    const paidToSupplier =
      Boolean(inv.paidAt) || inv.paymentOrderApps.length > 0;
    return {
      id: inv.id,
      workOrderId: inv.workOrderId,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      amount: round2(toNumber(inv.amount)),
      currency: inv.currency,
      paidAt: inv.paidAt?.toISOString() ?? null,
      paidToSupplier,
      pendingRecovery: paidToSupplier,
      supplierName: inv.supplier.name,
      workOrderCode: inv.workOrder.code,
      workOrderTitle: inv.workOrder.title,
      propertyTitle: inv.workOrder.property.title,
      contractCode: inv.workOrder.contract?.code ?? null,
      costBearerLabel: COST_BEARER_LABELS.AGENCY_RECOVERABLE,
    };
  });

  const totalByCurrency = sumByCurrency(
    rows.map((r) => ({ currency: r.currency, amount: r.amount })),
  );
  const paidByCurrency = sumByCurrency(
    rows
      .filter((r) => r.paidToSupplier)
      .map((r) => ({ currency: r.currency, amount: r.amount })),
  );
  const pendingPaymentByCurrency = sumByCurrency(
    rows
      .filter((r) => !r.paidToSupplier)
      .map((r) => ({ currency: r.currency, amount: r.amount })),
  );
  const pendingRecoveryByCurrency = sumByCurrency(
    rows
      .filter((r) => r.pendingRecovery)
      .map((r) => ({ currency: r.currency, amount: r.amount })),
  );

  return {
    range,
    invoices: rows,
    totalByCurrency,
    paidByCurrency,
    pendingPaymentByCurrency,
    pendingRecoveryByCurrency,
    workOrdersWithoutInvoice: workOrdersWithoutInvoice.map((wo) => ({
      id: wo.id,
      code: wo.code,
      title: wo.title,
      requestedAt: wo.requestedAt.toISOString(),
      status: wo.status,
      propertyTitle: wo.property.title,
      contractCode: wo.contract?.code ?? null,
      assigneeName: wo.assignee?.name ?? null,
    })),
  };
}
