import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { sumByCurrency } from "@/config/currencies";
import { formatInstallmentLabel } from "@/features/billing/lib/installment-label";
import type { ReportDateRange } from "@/features/reports/lib/date-range";

function toNumber(value: { toNumber(): number } | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type CashFlowMovementRow = {
  id: string;
  occurredAt: string;
  channel: "CASH" | "BANK";
  type: "INCOME" | "EXPENSE";
  amount: number;
  currency: string;
  description: string;
  accountLabel: string;
};

export type PendingCollectRow = {
  billId: string;
  tenantName: string;
  contractCode: string;
  propertyTitle: string;
  installmentLabel: string;
  dueDate: string;
  status: string;
  currency: string;
  balance: number;
};

export type PendingPaySettlementRow = {
  id: string;
  code: string;
  ownerName: string;
  periodLabel: string;
  currency: string;
  netPayout: number;
  paidAmount: number;
  balance: number;
};

export type PendingPayInvoiceRow = {
  id: string;
  label: string;
  supplierName: string;
  workOrderCode: string;
  currency: string;
  balance: number;
};

export type CashFlowReport = {
  range: ReportDateRange;
  incomeByCurrency: Record<string, number>;
  expenseByCurrency: Record<string, number>;
  netByCurrency: Record<string, number>;
  movements: CashFlowMovementRow[];
  pendingCollect: PendingCollectRow[];
  pendingCollectByCurrency: Record<string, number>;
  pendingSettlements: PendingPaySettlementRow[];
  pendingSettlementsByCurrency: Record<string, number>;
  pendingInvoices: PendingPayInvoiceRow[];
  pendingInvoicesByCurrency: Record<string, number>;
};

export async function getCashFlowReport(
  range: ReportDateRange,
): Promise<CashFlowReport> {
  const session = await requireStaff();
  const orgId = session.organizationId;
  const { from, to } = range;

  const [cancelledReceipts, cancelledOrders] = await Promise.all([
    prisma.receipt.findMany({
      where: { organizationId: orgId, status: "CANCELLED" },
      select: { id: true },
    }),
    prisma.paymentOrder.findMany({
      where: { organizationId: orgId, status: "CANCELLED" },
      select: { id: true },
    }),
  ]);
  const cancelledReceiptIds = cancelledReceipts.map((r) => r.id);
  const cancelledOrderIds = cancelledOrders.map((o) => o.id);

  const excludeCancelledAnd: Array<Record<string, unknown>> = [];
  if (cancelledReceiptIds.length) {
    excludeCancelledAnd.push({
      OR: [
        { receiptId: null },
        { receiptId: { notIn: cancelledReceiptIds } },
      ],
    });
  }
  if (cancelledOrderIds.length) {
    excludeCancelledAnd.push({
      OR: [
        { paymentOrderId: null },
        { paymentOrderId: { notIn: cancelledOrderIds } },
      ],
    });
  }

  const movementWhere = {
    organizationId: orgId,
    occurredAt: { gte: from, lte: to },
    ...(excludeCancelledAnd.length ? { AND: excludeCancelledAnd } : {}),
  };

  const [cashMovs, bankMovs, openBills, settlements, settlementApps, openInvoices] =
    await Promise.all([
      prisma.cashMovement.findMany({
        where: movementWhere,
        include: {
          register: { select: { name: true, currency: true } },
        },
        orderBy: { occurredAt: "desc" },
        take: 500,
      }),
      prisma.bankMovement.findMany({
        where: movementWhere,
        include: {
          bankAccount: { select: { name: true, bankName: true, currency: true } },
        },
        orderBy: { occurredAt: "desc" },
        take: 500,
      }),
      prisma.tenantBill.findMany({
        where: {
          status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
          contract: { organizationId: orgId },
        },
        include: {
          contract: {
            select: {
              code: true,
              startDate: true,
              endDate: true,
              property: { select: { title: true } },
              parties: {
                where: { role: "TENANT" },
                take: 1,
                include: { user: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { dueDate: "asc" },
        take: 400,
      }),
      prisma.ownerSettlement.findMany({
        where: {
          organizationId: orgId,
          status: "ISSUED",
        },
        include: { owner: { select: { name: true } } },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      }),
      prisma.paymentOrderSettlementApplication.findMany({
        where: {
          paymentOrder: {
            organizationId: orgId,
            status: "POSTED",
          },
          ownerSettlement: { status: "ISSUED" },
        },
        select: {
          ownerSettlementId: true,
          amount: true,
        },
      }),
      prisma.supplierInvoice.findMany({
        where: {
          paidAt: null,
          workOrder: { organizationId: orgId },
        },
        include: {
          supplier: { select: { name: true } },
          workOrder: {
            select: {
              code: true,
              property: { select: { title: true } },
            },
          },
        },
        orderBy: { invoiceDate: "asc" },
        take: 300,
      }),
    ]);

  const movements: CashFlowMovementRow[] = [
    ...cashMovs.map((m) => ({
      id: `cash-${m.id}`,
      occurredAt: m.occurredAt.toISOString(),
      channel: "CASH" as const,
      type: m.type as "INCOME" | "EXPENSE",
      amount: Math.abs(toNumber(m.amount)),
      currency: m.register.currency,
      description: m.description,
      accountLabel: m.register.name,
    })),
    ...bankMovs.map((m) => ({
      id: `bank-${m.id}`,
      occurredAt: m.occurredAt.toISOString(),
      channel: "BANK" as const,
      type: m.type as "INCOME" | "EXPENSE",
      amount: Math.abs(toNumber(m.amount)),
      currency: m.bankAccount.currency,
      description: m.description,
      accountLabel: `${m.bankAccount.name} · ${m.bankAccount.bankName}`,
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const incomeItems = movements
    .filter((m) => m.type === "INCOME")
    .map((m) => ({ currency: m.currency, amount: m.amount }));
  const expenseItems = movements
    .filter((m) => m.type === "EXPENSE")
    .map((m) => ({ currency: m.currency, amount: m.amount }));

  const incomeByCurrency = sumByCurrency(incomeItems);
  const expenseByCurrency = sumByCurrency(expenseItems);
  const netByCurrency: Record<string, number> = {};
  for (const code of new Set([
    ...Object.keys(incomeByCurrency),
    ...Object.keys(expenseByCurrency),
  ])) {
    netByCurrency[code] = round2(
      (incomeByCurrency[code] ?? 0) - (expenseByCurrency[code] ?? 0),
    );
  }

  const pendingCollect: PendingCollectRow[] = [];
  for (const bill of openBills) {
    const balance = round2(
      toNumber(bill.totalAmount) - toNumber(bill.paidAmount),
    );
    if (balance <= 0.009) continue;
    pendingCollect.push({
      billId: bill.id,
      tenantName: bill.contract.parties[0]?.user.name ?? "—",
      contractCode: bill.contract.code,
      propertyTitle: bill.contract.property.title,
      installmentLabel: formatInstallmentLabel({
        contractStart: bill.contract.startDate,
        contractEnd: bill.contract.endDate,
        periodYear: bill.periodYear,
        periodMonth: bill.periodMonth,
      }),
      dueDate: bill.dueDate.toISOString(),
      status: bill.status,
      currency: bill.currency,
      balance,
    });
  }

  const paidBySettlement = new Map<string, number>();
  for (const app of settlementApps) {
    paidBySettlement.set(
      app.ownerSettlementId,
      round2((paidBySettlement.get(app.ownerSettlementId) ?? 0) + toNumber(app.amount)),
    );
  }

  const pendingSettlements: PendingPaySettlementRow[] = [];
  for (const s of settlements) {
    const netPayout = round2(toNumber(s.netPayout));
    const paidAmount = paidBySettlement.get(s.id) ?? 0;
    const balance = round2(netPayout - paidAmount);
    if (balance <= 0.009) continue;
    pendingSettlements.push({
      id: s.id,
      code: s.code,
      ownerName: s.owner.name,
      periodLabel: `${String(s.periodMonth).padStart(2, "0")}/${s.periodYear}`,
      currency: s.currency,
      netPayout,
      paidAmount,
      balance,
    });
  }

  const pendingInvoices: PendingPayInvoiceRow[] = [];
  for (const inv of openInvoices) {
    const balance = round2(toNumber(inv.amount));
    if (balance <= 0.009) continue;
    pendingInvoices.push({
      id: inv.id,
      label: inv.invoiceNumber ?? "Factura",
      supplierName: inv.supplier.name,
      workOrderCode: inv.workOrder.code,
      currency: inv.currency,
      balance,
    });
  }

  return {
    range,
    incomeByCurrency,
    expenseByCurrency,
    netByCurrency,
    movements,
    pendingCollect,
    pendingCollectByCurrency: sumByCurrency(
      pendingCollect.map((r) => ({ currency: r.currency, amount: r.balance })),
    ),
    pendingSettlements,
    pendingSettlementsByCurrency: sumByCurrency(
      pendingSettlements.map((r) => ({
        currency: r.currency,
        amount: r.balance,
      })),
    ),
    pendingInvoices,
    pendingInvoicesByCurrency: sumByCurrency(
      pendingInvoices.map((r) => ({ currency: r.currency, amount: r.balance })),
    ),
  };
}
