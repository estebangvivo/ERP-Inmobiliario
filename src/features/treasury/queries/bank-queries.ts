import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import type { BankMovementType } from "@prisma/client";

export type BankAccountListItem = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string | null;
  cbu: string | null;
  alias: string | null;
  currency: string;
  balance: number;
  isActive: boolean;
  notes: string | null;
};

export type BankAccountOption = {
  id: string;
  name: string;
  bankName: string;
  currency: string;
  label: string;
};

export type BankMovementView = {
  id: string;
  type: BankMovementType;
  amount: number;
  balanceAfter: number | null;
  description: string;
  occurredAt: Date;
  receiptId: string | null;
  paymentOrderId: string | null;
};

function toNumber(value: { toNumber(): number } | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

export async function listBankAccounts(opts?: {
  activeOnly?: boolean;
}): Promise<BankAccountListItem[]> {
  const session = await requireStaff();
  const rows = await prisma.bankAccount.findMany({
    where: {
      organizationId: session.organizationId,
      ...(opts?.activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    bankName: b.bankName,
    accountNumber: b.accountNumber,
    cbu: b.cbu,
    alias: b.alias,
    currency: b.currency,
    balance: toNumber(b.balance),
    isActive: b.isActive,
    notes: b.notes,
  }));
}

export async function listActiveBankAccountsForPayment(opts?: {
  currency?: string;
}): Promise<BankAccountOption[]> {
  const accounts = await listBankAccounts({ activeOnly: true });
  const currency = opts?.currency?.toUpperCase();
  return accounts
    .filter((a) => !currency || a.currency.toUpperCase() === currency)
    .map((a) => ({
      id: a.id,
      name: a.name,
      bankName: a.bankName,
      currency: a.currency,
      label: `${a.name} · ${a.bankName} (${a.currency})`,
    }));
}

export async function getBankAccountDetail(id: string): Promise<{
  account: BankAccountListItem;
  movements: BankMovementView[];
} | null> {
  const session = await requireStaff();
  const account = await prisma.bankAccount.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!account) return null;

  const movements = await prisma.bankMovement.findMany({
    where: {
      organizationId: session.organizationId,
      bankAccountId: id,
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return {
    account: {
      id: account.id,
      name: account.name,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      cbu: account.cbu,
      alias: account.alias,
      currency: account.currency,
      balance: toNumber(account.balance),
      isActive: account.isActive,
      notes: account.notes,
    },
    movements: movements.map((m) => ({
      id: m.id,
      type: m.type,
      amount: toNumber(m.amount),
      balanceAfter:
        m.balanceAfter != null ? toNumber(m.balanceAfter) : null,
      description: m.description,
      occurredAt: m.occurredAt,
      receiptId: m.receiptId,
      paymentOrderId: m.paymentOrderId,
    })),
  };
}
