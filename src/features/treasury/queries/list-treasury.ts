import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import type { TreasuryPaymentMethod, TreasuryDocStatus } from "@prisma/client";
import { formatPaymentMethodsShort } from "@/features/treasury/lib/payments";

export type TreasuryListItem = {
  id: string;
  number: string;
  issueDate: Date;
  status: TreasuryDocStatus;
  paymentMethod: TreasuryPaymentMethod;
  paymentMethodsLabel: string;
  partyName: string;
  concept: string | null;
  totalAmount: number;
  currency: string;
  contractLabels: string[];
};

function toNumber(value: { toNumber(): number } | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

export async function listReceipts(): Promise<TreasuryListItem[]> {
  const session = await requireStaff();

  const rows = await prisma.receipt.findMany({
    where: { organizationId: session.organizationId },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    include: {
      tenant: { select: { name: true } },
      payments: { select: { method: true }, orderBy: { sortOrder: "asc" } },
      lines: {
        include: {
          contract: { select: { code: true } },
          property: { select: { title: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    issueDate: r.issueDate,
    status: r.status,
    paymentMethod: r.paymentMethod,
    paymentMethodsLabel: formatPaymentMethodsShort(r.payments, r.paymentMethod),
    partyName: r.tenant?.name ?? r.partyName ?? "—",
    concept: r.concept,
    totalAmount: toNumber(r.totalAmount),
    currency: r.currency,
    contractLabels: [
      ...new Set(
        r.lines
          .filter((l) => l.contract)
          .map((l) => `${l.contract!.code} · ${l.property?.title ?? ""}`.trim()),
      ),
    ],
  }));
}

export async function listPaymentOrders(): Promise<TreasuryListItem[]> {
  const session = await requireStaff();

  const rows = await prisma.paymentOrder.findMany({
    where: { organizationId: session.organizationId },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    include: {
      supplier: { select: { name: true } },
      payments: { select: { method: true }, orderBy: { sortOrder: "asc" } },
      lines: {
        include: {
          contract: { select: { code: true } },
          property: { select: { title: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    issueDate: r.issueDate,
    status: r.status,
    paymentMethod: r.paymentMethod,
    paymentMethodsLabel: formatPaymentMethodsShort(r.payments, r.paymentMethod),
    partyName: r.supplier?.name ?? r.partyName ?? "—",
    concept: r.concept,
    totalAmount: toNumber(r.totalAmount),
    currency: r.currency,
    contractLabels: [
      ...new Set(
        r.lines
          .filter((l) => l.contract)
          .map((l) => `${l.contract!.code} · ${l.property?.title ?? ""}`.trim()),
      ),
    ],
  }));
}

export async function getReceiptById(id: string) {
  const session = await requireStaff();
  return prisma.receipt.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      tenant: true,
      payments: {
        orderBy: { sortOrder: "asc" },
        include: {
          bankAccount: { select: { id: true, name: true, bankName: true } },
        },
      },
      lines: {
        include: {
          contract: { select: { id: true, code: true } },
          property: { select: { id: true, title: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function getPaymentOrderById(id: string) {
  const session = await requireStaff();
  return prisma.paymentOrder.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      supplier: true,
      payments: {
        orderBy: { sortOrder: "asc" },
        include: {
          bankAccount: { select: { id: true, name: true, bankName: true } },
          checkInstrument: {
            select: { id: true, number: true, bank: true, status: true },
          },
        },
      },
      lines: {
        include: {
          contract: { select: { id: true, code: true } },
          property: { select: { id: true, title: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function hasCashMovementForDoc(input: {
  receiptId?: string;
  paymentOrderId?: string;
}): Promise<boolean> {
  const session = await requireStaff();
  const count = await prisma.cashMovement.count({
    where: {
      organizationId: session.organizationId,
      type: { in: ["INCOME", "EXPENSE"] },
      ...(input.receiptId ? { receiptId: input.receiptId } : {}),
      ...(input.paymentOrderId ? { paymentOrderId: input.paymentOrderId } : {}),
    },
  });
  return count > 0;
}

export async function listTenantsForTreasury() {
  const session = await requireStaff();
  return prisma.user.findMany({
    where: {
      isActive: true,
      memberships: {
        some: { organizationId: session.organizationId, role: "TENANT" },
      },
    },
    select: { id: true, name: true, documentNumber: true },
    orderBy: { name: "asc" },
  });
}

export async function listSuppliersForTreasury() {
  const session = await requireStaff();
  return prisma.user.findMany({
    where: {
      isActive: true,
      memberships: {
        some: { organizationId: session.organizationId, role: "SUPPLIER" },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Totales operativos desde movimientos (incluye cobros sin recibo). */
export async function getTreasuryFlowTotals() {
  const session = await requireStaff();
  const orgId = session.organizationId;

  const [cashIn, cashOut, bankIn, bankOut] = await Promise.all([
    prisma.cashMovement.findMany({
      where: { organizationId: orgId, type: "INCOME" },
      select: { amount: true, register: { select: { currency: true } } },
    }),
    prisma.cashMovement.findMany({
      where: { organizationId: orgId, type: "EXPENSE" },
      select: { amount: true, register: { select: { currency: true } } },
    }),
    prisma.bankMovement.findMany({
      where: { organizationId: orgId, type: "INCOME" },
      select: { amount: true, bankAccount: { select: { currency: true } } },
    }),
    prisma.bankMovement.findMany({
      where: { organizationId: orgId, type: "EXPENSE" },
      select: { amount: true, bankAccount: { select: { currency: true } } },
    }),
  ]);

  const income: { currency: string; amount: number }[] = [
    ...cashIn.map((m) => ({
      currency: m.register.currency,
      amount: Math.abs(toNumber(m.amount)),
    })),
    ...bankIn.map((m) => ({
      currency: m.bankAccount.currency,
      amount: Math.abs(toNumber(m.amount)),
    })),
  ];
  const expense: { currency: string; amount: number }[] = [
    ...cashOut.map((m) => ({
      currency: m.register.currency,
      amount: Math.abs(toNumber(m.amount)),
    })),
    ...bankOut.map((m) => ({
      currency: m.bankAccount.currency,
      amount: Math.abs(toNumber(m.amount)),
    })),
  ];

  return { income, expense };
}
