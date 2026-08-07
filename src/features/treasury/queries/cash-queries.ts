import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import {
  ensureCashRegisters,
  toNumber,
} from "@/features/treasury/lib/cash-helpers";
import { formatPaymentMethodsShort } from "@/features/treasury/lib/payments";
import type {
  CashMovementType,
  CashSessionStatus,
} from "@prisma/client";

export type CashRegisterView = {
  id: string;
  type: "DAILY" | "TREASURY";
  name: string;
  currency: string;
  balance: number;
};

export type CashSessionListItem = {
  id: string;
  number: string;
  businessDate: Date;
  status: CashSessionStatus;
  currency: string;
  openingBalance: number;
  expectedBalance: number | null;
  countedBalance: number | null;
  difference: number | null;
  transferredAmount: number | null;
  openedAt: Date;
  closedAt: Date | null;
};

export type CashMovementView = {
  id: string;
  type: CashMovementType;
  amount: number;
  balanceAfter: number | null;
  description: string;
  occurredAt: Date;
  receiptId: string | null;
  paymentOrderId: string | null;
  sourceSessionId: string | null;
  /** Datos del documento de tesorería vinculado (si hay). */
  linkedDoc: {
    kind: "receipt" | "payment-order";
    id: string;
    number: string;
    paymentMethodsLabel: string;
    partyName: string | null;
    href: string;
  } | null;
};

export type CashSessionDetail = CashSessionListItem & {
  registerId: string;
  notes: string | null;
  movements: CashMovementView[];
  incomeTotal: number;
  expenseTotal: number;
  runningBalance: number;
};

export async function getCashOverview(currency = "ARS") {
  const session = await requireStaff();
  const { daily, treasury } = await ensureCashRegisters(
    session.organizationId,
    currency,
  );

  const openSession = await prisma.cashSession.findFirst({
    where: {
      organizationId: session.organizationId,
      registerId: daily.id,
      status: "OPEN",
    },
    orderBy: { openedAt: "desc" },
  });

  const recentSessions = await prisma.cashSession.findMany({
    where: {
      organizationId: session.organizationId,
      registerId: daily.id,
    },
    orderBy: [{ businessDate: "desc" }, { openedAt: "desc" }],
    take: 10,
  });

  const treasuryMovements = await prisma.cashMovement.findMany({
    where: {
      organizationId: session.organizationId,
      registerId: treasury.id,
    },
    orderBy: { occurredAt: "desc" },
    take: 20,
  });

  return {
    daily: {
      id: daily.id,
      type: "DAILY" as const,
      name: daily.name,
      currency: daily.currency,
      balance: toNumber(daily.balance),
    },
    treasury: {
      id: treasury.id,
      type: "TREASURY" as const,
      name: treasury.name,
      currency: treasury.currency,
      balance: toNumber(treasury.balance),
    },
    openSession: openSession
      ? {
          id: openSession.id,
          number: openSession.number,
          businessDate: openSession.businessDate,
          status: openSession.status,
          currency: openSession.currency,
          openingBalance: toNumber(openSession.openingBalance),
          expectedBalance:
            openSession.expectedBalance != null
              ? toNumber(openSession.expectedBalance)
              : null,
          countedBalance:
            openSession.countedBalance != null
              ? toNumber(openSession.countedBalance)
              : null,
          difference:
            openSession.difference != null
              ? toNumber(openSession.difference)
              : null,
          transferredAmount:
            openSession.transferredAmount != null
              ? toNumber(openSession.transferredAmount)
              : null,
          openedAt: openSession.openedAt,
          closedAt: openSession.closedAt,
        }
      : null,
    recentSessions: recentSessions.map((s) => ({
      id: s.id,
      number: s.number,
      businessDate: s.businessDate,
      status: s.status,
      currency: s.currency,
      openingBalance: toNumber(s.openingBalance),
      expectedBalance:
        s.expectedBalance != null ? toNumber(s.expectedBalance) : null,
      countedBalance:
        s.countedBalance != null ? toNumber(s.countedBalance) : null,
      difference: s.difference != null ? toNumber(s.difference) : null,
      transferredAmount:
        s.transferredAmount != null ? toNumber(s.transferredAmount) : null,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
    })),
    treasuryMovements: treasuryMovements.map((m) => ({
      id: m.id,
      type: m.type,
      amount: toNumber(m.amount),
      balanceAfter: m.balanceAfter != null ? toNumber(m.balanceAfter) : null,
      description: m.description,
      occurredAt: m.occurredAt,
      receiptId: m.receiptId,
      paymentOrderId: m.paymentOrderId,
      sourceSessionId: m.sourceSessionId,
    })),
  };
}

export async function getCashSessionById(
  sessionId: string,
): Promise<CashSessionDetail | null> {
  const auth = await requireStaff();
  const row = await prisma.cashSession.findFirst({
    where: {
      id: sessionId,
      organizationId: auth.organizationId,
    },
    include: {
      movements: { orderBy: { occurredAt: "asc" } },
    },
  });
  if (!row) return null;

  const receiptIds = [
    ...new Set(
      row.movements
        .map((m) => m.receiptId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const paymentOrderIds = [
    ...new Set(
      row.movements
        .map((m) => m.paymentOrderId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [receipts, paymentOrders] = await Promise.all([
    receiptIds.length
      ? prisma.receipt.findMany({
          where: {
            id: { in: receiptIds },
            organizationId: auth.organizationId,
          },
          select: {
            id: true,
            number: true,
            paymentMethod: true,
            partyName: true,
            tenant: { select: { name: true } },
            payments: { select: { method: true }, orderBy: { sortOrder: "asc" } },
          },
        })
      : Promise.resolve([]),
    paymentOrderIds.length
      ? prisma.paymentOrder.findMany({
          where: {
            id: { in: paymentOrderIds },
            organizationId: auth.organizationId,
          },
          select: {
            id: true,
            number: true,
            paymentMethod: true,
            partyName: true,
            supplier: { select: { name: true } },
            payments: { select: { method: true }, orderBy: { sortOrder: "asc" } },
          },
        })
      : Promise.resolve([]),
  ]);

  const receiptById = new Map(receipts.map((r) => [r.id, r]));
  const orderById = new Map(paymentOrders.map((o) => [o.id, o]));

  const movements = row.movements.map((m) => {
    let linkedDoc: CashMovementView["linkedDoc"] = null;
    if (m.receiptId) {
      const r = receiptById.get(m.receiptId);
      if (r) {
        linkedDoc = {
          kind: "receipt",
          id: r.id,
          number: r.number,
          paymentMethodsLabel: formatPaymentMethodsShort(
            r.payments,
            r.paymentMethod,
          ),
          partyName: r.tenant?.name ?? r.partyName,
          href: `/tesoreria/recibos/${r.id}`,
        };
      }
    } else if (m.paymentOrderId) {
      const o = orderById.get(m.paymentOrderId);
      if (o) {
        linkedDoc = {
          kind: "payment-order",
          id: o.id,
          number: o.number,
          paymentMethodsLabel: formatPaymentMethodsShort(
            o.payments,
            o.paymentMethod,
          ),
          partyName: o.supplier?.name ?? o.partyName,
          href: `/tesoreria/ordenes-pago/${o.id}`,
        };
      }
    }

    return {
      id: m.id,
      type: m.type,
      amount: toNumber(m.amount),
      balanceAfter: m.balanceAfter != null ? toNumber(m.balanceAfter) : null,
      description: m.description,
      occurredAt: m.occurredAt,
      receiptId: m.receiptId,
      paymentOrderId: m.paymentOrderId,
      sourceSessionId: m.sourceSessionId,
      linkedDoc,
    };
  });

  const incomeTotal = movements
    .filter((m) => m.amount > 0 && m.type !== "CLOSE_TRANSFER")
    .reduce((a, m) => a + m.amount, 0);
  const expenseTotal = movements
    .filter((m) => m.amount < 0 && m.type !== "CLOSE_TRANSFER")
    .reduce((a, m) => a + Math.abs(m.amount), 0);
  const runningBalance = movements
    .filter((m) => m.type !== "CLOSE_TRANSFER")
    .reduce((a, m) => a + m.amount, 0);

  return {
    id: row.id,
    registerId: row.registerId,
    number: row.number,
    businessDate: row.businessDate,
    status: row.status,
    currency: row.currency,
    openingBalance: toNumber(row.openingBalance),
    expectedBalance:
      row.expectedBalance != null ? toNumber(row.expectedBalance) : null,
    countedBalance:
      row.countedBalance != null ? toNumber(row.countedBalance) : null,
    difference: row.difference != null ? toNumber(row.difference) : null,
    transferredAmount:
      row.transferredAmount != null ? toNumber(row.transferredAmount) : null,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    notes: row.notes,
    movements,
    incomeTotal,
    expenseTotal,
    runningBalance,
  };
}
