import { prisma } from "@/lib/prisma";
import { getUnitExpenseBreakdown } from "@/server/services/billing";

const OPEN = ["PENDING", "PARTIAL", "OVERDUE"] as const;

export type TenantDebtRow = {
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  openBills: number;
  balanceByCurrency: Record<string, number>;
  oldestDueDate: Date | null;
};

export async function listTenantsWithDebt(
  organizationId: string,
): Promise<TenantDebtRow[]> {
  const bills = await prisma.tenantBill.findMany({
    where: {
      status: { in: [...OPEN] },
      contract: {
        organizationId,
        parties: { some: { role: "TENANT" } },
      },
    },
    include: {
      contract: {
        include: {
          parties: {
            where: { role: "TENANT" },
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const map = new Map<
    string,
    TenantDebtRow & { _oldest: Date | null }
  >();

  for (const bill of bills) {
    const tenant = bill.contract.parties[0]?.user;
    if (!tenant) continue;
    const balance = Number(bill.totalAmount) - Number(bill.paidAmount);
    if (balance <= 0.001) continue;

    let row = map.get(tenant.id);
    if (!row) {
      row = {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        openBills: 0,
        balanceByCurrency: {},
        oldestDueDate: null,
        _oldest: null,
      };
      map.set(tenant.id, row);
    }
    row.openBills += 1;
    row.balanceByCurrency[bill.currency] =
      (row.balanceByCurrency[bill.currency] ?? 0) + balance;
    if (!row._oldest || bill.dueDate < row._oldest) {
      row._oldest = bill.dueDate;
      row.oldestDueDate = bill.dueDate;
    }
  }

  return [...map.values()]
    .map(({ _oldest: _, ...rest }) => rest)
    .sort((a, b) => {
      const aTotal = Object.values(a.balanceByCurrency).reduce((s, n) => s + n, 0);
      const bTotal = Object.values(b.balanceByCurrency).reduce((s, n) => s + n, 0);
      return bTotal - aTotal;
    });
}

export type BillDebtDetail = {
  id: string;
  periodYear: number;
  periodMonth: number;
  dueDate: Date;
  status: string;
  currency: "ARS" | "USD" | "EUR";
  contractCode: string;
  propertyTitle: string;
  rentAmount: number;
  ordinaryExpenses: number;
  extraordinaryExpenses: number;
  expensesAmount: number;
  commissionAmount: number;
  lateFeeAmount: number;
  otherAmount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
};

export async function getTenantDebtDetail(
  organizationId: string,
  tenantId: string,
): Promise<{
  tenant: { id: string; name: string; email: string; phone: string | null };
  bills: BillDebtDetail[];
  balanceByCurrency: Record<string, number>;
} | null> {
  const tenant = await prisma.user.findFirst({
    where: {
      id: tenantId,
      contractParties: {
        some: {
          role: "TENANT",
          contract: { organizationId },
        },
      },
    },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!tenant) return null;

  const bills = await prisma.tenantBill.findMany({
    where: {
      status: { in: [...OPEN] },
      contract: {
        organizationId,
        parties: { some: { role: "TENANT", userId: tenantId } },
      },
    },
    include: {
      contract: {
        include: {
          property: { select: { title: true, unitId: true } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { periodYear: "asc" }, { periodMonth: "asc" }],
  });

  const details: BillDebtDetail[] = [];
  const balanceByCurrency: Record<string, number> = {};

  for (const bill of bills) {
    const balance = Number(bill.totalAmount) - Number(bill.paidAmount);
    if (balance <= 0.001) continue;

    let ordinary = 0;
    let extraordinary = 0;
    if (bill.contract.property.unitId) {
      const breakdown = await getUnitExpenseBreakdown(
        bill.contract.property.unitId,
        bill.periodYear,
        bill.periodMonth,
      );
      ordinary = breakdown.ordinary;
      extraordinary = breakdown.extraordinary;
    }
    // Si no hay desglose en allocations, usar el snapshot de la cuota
    if (
      ordinary + extraordinary === 0 &&
      Number(bill.expensesAmount) > 0
    ) {
      ordinary = Number(bill.expensesAmount);
    }
    // Si el desglose no cierra con el snapshot de la cuota, preferir el snapshot
    // (evita sub-tildar el saldo en cobros).
    const expensesSnap = Number(bill.expensesAmount);
    if (
      expensesSnap > 0.001 &&
      Math.abs(ordinary + extraordinary - expensesSnap) > 0.05
    ) {
      ordinary = expensesSnap;
      extraordinary = 0;
    }

    details.push({
      id: bill.id,
      periodYear: bill.periodYear,
      periodMonth: bill.periodMonth,
      dueDate: bill.dueDate,
      status: bill.status,
      currency: bill.currency,
      contractCode: bill.contract.code,
      propertyTitle: bill.contract.property.title,
      rentAmount: Number(bill.rentAmount),
      ordinaryExpenses: ordinary,
      extraordinaryExpenses: extraordinary,
      expensesAmount: Number(bill.expensesAmount),
      commissionAmount: Number(bill.commissionAmount),
      lateFeeAmount: Number(bill.lateFeeAmount),
      otherAmount: Number(bill.otherAmount),
      totalAmount: Number(bill.totalAmount),
      paidAmount: Number(bill.paidAmount),
      balance,
    });

    balanceByCurrency[bill.currency] =
      (balanceByCurrency[bill.currency] ?? 0) + balance;
  }

  return { tenant, bills: details, balanceByCurrency };
}
