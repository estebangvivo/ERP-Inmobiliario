import { prisma } from "@/lib/prisma";

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export type MoneyBucket = Record<string, number>;

function addAmount(bucket: MoneyBucket, currency: string, amount: number) {
  bucket[currency] = (bucket[currency] ?? 0) + amount;
}

export async function getStaffDaySnapshot(organizationId: string) {
  const start = startOfUtcDay();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const [paymentsToday, ordersToday, dueBills] = await Promise.all([
    prisma.payment.findMany({
      where: {
        paidAt: { gte: start, lt: end },
        tenantBill: { contract: { organizationId } },
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        paidAt: true,
        tenantBill: {
          select: {
            id: true,
            contract: {
              select: { code: true, property: { select: { title: true } } },
            },
          },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 8,
    }),
    prisma.paymentOrder.findMany({
      where: {
        organizationId,
        issueDate: { gte: start, lt: end },
        status: { in: ["ISSUED", "POSTED"] },
      },
      select: {
        id: true,
        number: true,
        partyName: true,
        concept: true,
        totalAmount: true,
        currency: true,
      },
      orderBy: { issueDate: "desc" },
      take: 8,
    }),
    prisma.tenantBill.findMany({
      where: {
        contract: { organizationId },
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        dueDate: { lte: end },
      },
      select: {
        id: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        currency: true,
        contract: {
          select: { code: true, property: { select: { title: true } } },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
  ]);

  const collected: MoneyBucket = {};
  for (const p of paymentsToday) addAmount(collected, p.currency, Number(p.amount));

  const paidOut: MoneyBucket = {};
  for (const o of ordersToday) {
    addAmount(paidOut, o.currency, Number(o.totalAmount));
  }

  return {
    collected,
    paidOut,
    paymentsToday,
    ordersToday,
    dueBills,
  };
}
