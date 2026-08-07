import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import type { CheckStatus } from "@prisma/client";
import { backfillMissingChecksFromPostedReceipts } from "@/features/treasury/lib/check-portfolio";
import { formatDateAR } from "@/lib/format-date";

export type CheckAllocationTarget = {
  contractId: string;
  contractLabel: string;
  propertyId: string;
  propertyLabel: string;
};

export type CheckListItem = {
  id: string;
  number: string;
  bank: string;
  isElectronic: boolean;
  amount: number;
  currency: string;
  issueDate: Date | null;
  dueDate: Date | null;
  account: string | null;
  drawerName: string | null;
  status: CheckStatus;
  bounceReason: string | null;
  bouncedAt: Date | null;
  receiptId: string | null;
  receiptNumber: string | null;
  paymentOrderId: string | null;
  paymentOrderNumber: string | null;
  depositedBankAccountId: string | null;
  depositedBankAccountName: string | null;
  issuedFromBankAccountId: string | null;
  issuedFromBankAccountName: string | null;
  kind: "THIRD_PARTY" | "OWN";
  allocationTargets: CheckAllocationTarget[];
  createdAt: Date;
};

function toNumber(value: { toNumber(): number } | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

export async function listChecks(opts?: {
  status?: CheckStatus | "ALL";
  kind?: "THIRD_PARTY" | "OWN" | "ALL";
}): Promise<CheckListItem[]> {
  const session = await requireStaff();
  const status = opts?.status ?? "IN_PORTFOLIO";
  const kind = opts?.kind ?? "THIRD_PARTY";

  // Repara cheques de recibos imputados antes de existir la cartera.
  await prisma.$transaction((tx) =>
    backfillMissingChecksFromPostedReceipts(tx, session.organizationId),
  );

  const rows = await prisma.checkInstrument.findMany({
    where: {
      organizationId: session.organizationId,
      ...(status !== "ALL" ? { status } : {}),
      ...(kind !== "ALL" ? { kind } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    include: {
      receipt: {
        select: {
          id: true,
          number: true,
          lines: {
            select: {
              contractId: true,
              propertyId: true,
              contract: { select: { code: true } },
              property: { select: { title: true } },
            },
          },
        },
      },
      paymentOrder: {
        select: {
          id: true,
          number: true,
          lines: {
            select: {
              contractId: true,
              propertyId: true,
              contract: { select: { code: true } },
              property: { select: { title: true } },
            },
          },
        },
      },
      depositedBankAccount: { select: { id: true, name: true } },
      issuedFromBankAccount: { select: { id: true, name: true } },
    },
  });

  return rows.map((c) => {
    const seen = new Set<string>();
    const allocationTargets: CheckAllocationTarget[] = [];
    const sourceLines = [
      ...(c.receipt?.lines ?? []),
      ...(c.paymentOrder?.lines ?? []),
    ];
    for (const line of sourceLines) {
      if (!line.contractId || !line.propertyId) continue;
      const key = `${line.contractId}:${line.propertyId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allocationTargets.push({
        contractId: line.contractId,
        contractLabel: line.contract?.code ?? line.contractId,
        propertyId: line.propertyId,
        propertyLabel: line.property?.title ?? line.propertyId,
      });
    }

    return {
      id: c.id,
      number: c.number,
      bank: c.bank,
      isElectronic: c.isElectronic,
      amount: toNumber(c.amount),
      currency: c.currency,
      issueDate: c.issueDate,
      dueDate: c.dueDate,
      account: c.account,
      drawerName: c.drawerName,
      status: c.status,
      bounceReason: c.bounceReason,
      bouncedAt: c.bouncedAt,
      receiptId: c.receiptId,
      receiptNumber: c.receipt?.number ?? null,
      paymentOrderId: c.paymentOrderId,
      paymentOrderNumber: c.paymentOrder?.number ?? null,
      depositedBankAccountId: c.depositedBankAccountId,
      depositedBankAccountName: c.depositedBankAccount?.name ?? null,
      issuedFromBankAccountId: c.issuedFromBankAccountId,
      issuedFromBankAccountName: c.issuedFromBankAccount?.name ?? null,
      kind: c.kind === "OWN" ? "OWN" : "THIRD_PARTY",
      allocationTargets,
      createdAt: c.createdAt,
    };
  });
}

/** Cheques disponibles para usar en una orden de pago. */
export async function listPortfolioChecksForPayment(): Promise<
  {
    id: string;
    number: string;
    bank: string;
    amount: number;
    currency: string;
    dueDate: string | null;
    drawerName: string | null;
    isElectronic: boolean;
    label: string;
  }[]
> {
  const checks = await listChecks({ status: "IN_PORTFOLIO" });
  return checks.map((c) => ({
    id: c.id,
    number: c.number,
    bank: c.bank,
    amount: c.amount,
    currency: c.currency,
    dueDate: c.dueDate ? c.dueDate.toISOString().slice(0, 10) : null,
    drawerName: c.drawerName,
    isElectronic: c.isElectronic,
    label: `${c.isElectronic ? "E · " : ""}${c.number} · ${c.bank} · ${c.amount.toLocaleString("es-AR", {
      style: "currency",
      currency: c.currency,
    })}${c.dueDate ? ` · vto ${formatDateAR(c.dueDate)}` : ""}`,
  }));
}

function parseDbDate(d: Date): Date {
  // @db.Date llega como medianoche UTC; usamos el día calendario.
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addLocalDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export type CheckDueAlertItem = {
  id: string;
  number: string;
  bank: string;
  amount: number;
  currency: string;
  dueDate: Date;
  drawerName: string | null;
  daysUntilDue: number; // negativo = vencido
  kind: "THIRD_PARTY" | "OWN";
};

export type ChecksDueAlert = {
  alertDays: number;
  overdue: CheckDueAlertItem[];
  dueSoon: CheckDueAlertItem[];
  total: number;
};

/** Cheques en cartera vencidos o por vencer según configuración de la org. */
export async function getChecksDueAlert(): Promise<ChecksDueAlert> {
  const session = await requireStaff();

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { checkDueAlertDays: true },
  });
  const alertDays = Math.max(0, org?.checkDueAlertDays ?? 7);

  const today = startOfLocalDay();
  const horizon = addLocalDays(today, alertDays);

  const rows = await prisma.checkInstrument.findMany({
    where: {
      organizationId: session.organizationId,
      OR: [
        { kind: "THIRD_PARTY", status: "IN_PORTFOLIO" },
        { kind: "OWN", status: "DELIVERED" },
      ],
      dueDate: {
        not: null,
        lte: new Date(
          Date.UTC(
            horizon.getFullYear(),
            horizon.getMonth(),
            horizon.getDate(),
          ),
        ),
      },
    },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    take: 50,
  });

  const overdue: CheckDueAlertItem[] = [];
  const dueSoon: CheckDueAlertItem[] = [];

  for (const row of rows) {
    if (!row.dueDate) continue;
    const due = parseDbDate(row.dueDate);
    const daysUntilDue = Math.round(
      (due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    );
    const item: CheckDueAlertItem = {
      id: row.id,
      number: row.number,
      bank: row.bank,
      amount: toNumber(row.amount),
      currency: row.currency,
      dueDate: row.dueDate,
      drawerName: row.drawerName,
      daysUntilDue,
      kind: row.kind === "OWN" ? "OWN" : "THIRD_PARTY",
    };
    if (daysUntilDue < 0) overdue.push(item);
    else dueSoon.push(item);
  }

  return {
    alertDays,
    overdue,
    dueSoon,
    total: overdue.length + dueSoon.length,
  };
}
