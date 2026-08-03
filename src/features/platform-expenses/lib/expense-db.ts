import { prisma } from "@/lib/prisma";
import type { PlatformExpenseCategory } from "@/features/platform-expenses/lib/categories";
import type {
  PlatformSystemExpense,
  PlatformSystemExpenseCategory,
  Prisma,
} from "@prisma/client";

export type PlatformExpenseRow = {
  id: string;
  date: string; // YYYY-MM-DD
  category: PlatformExpenseCategory;
  title: string;
  notes: string | null;
  currency: "ARS" | "USD";
  amount: number;
  hours: number | null;
  vendor: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

function toIsoDate(d: Date | string): string {
  if (typeof d === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
    if (m) return m[1];
    const parsed = new Date(d);
    if (!Number.isNaN(parsed.getTime())) {
      return toIsoDate(parsed);
    }
    return d.slice(0, 10);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v != null && typeof v === "object" && "toNumber" in v) {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : Number(v);
  }
  return Number(v);
}

function mapRow(r: PlatformSystemExpense): PlatformExpenseRow {
  return {
    id: r.id,
    date: toIsoDate(r.date),
    category: r.category as PlatformExpenseCategory,
    title: r.title,
    notes: r.notes,
    currency: r.currency === "USD" ? "USD" : "ARS",
    amount: num(r.amount),
    hours: r.hours == null ? null : num(r.hours),
    vendor: r.vendor,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type ExpenseListFilters = {
  from?: string | null;
  to?: string | null;
  category?: string | null;
  currency?: string | null;
};

export async function dbListPlatformExpenses(
  filters: ExpenseListFilters,
): Promise<PlatformExpenseRow[]> {
  const where: Prisma.PlatformSystemExpenseWhereInput = {};

  if (filters.from?.trim() || filters.to?.trim()) {
    where.date = {};
    if (filters.from?.trim()) {
      where.date.gte = new Date(`${filters.from.trim()}T00:00:00.000Z`);
    }
    if (filters.to?.trim()) {
      where.date.lte = new Date(`${filters.to.trim()}T00:00:00.000Z`);
    }
  }
  if (filters.category?.trim() && filters.category !== "ANY") {
    where.category = filters.category.trim() as PlatformSystemExpenseCategory;
  }
  if (filters.currency?.trim() && filters.currency !== "ANY") {
    where.currency = filters.currency.trim().toUpperCase();
  }

  const rows = await prisma.platformSystemExpense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map(mapRow);
}

export async function dbCreatePlatformExpense(input: {
  date: string;
  category: PlatformExpenseCategory;
  title: string;
  notes: string | null;
  currency: "ARS" | "USD";
  amount: number;
  hours: number | null;
  vendor: string | null;
  createdByUserId: string | null;
}): Promise<PlatformExpenseRow> {
  const row = await prisma.platformSystemExpense.create({
    data: {
      date: new Date(`${input.date}T00:00:00.000Z`),
      category: input.category as PlatformSystemExpenseCategory,
      title: input.title,
      notes: input.notes,
      currency: input.currency,
      amount: input.amount,
      hours: input.hours,
      vendor: input.vendor,
      createdByUserId: input.createdByUserId,
    },
  });
  return mapRow(row);
}

export async function dbUpdatePlatformExpense(input: {
  id: string;
  date: string;
  category: PlatformExpenseCategory;
  title: string;
  notes: string | null;
  currency: "ARS" | "USD";
  amount: number;
  hours: number | null;
  vendor: string | null;
}): Promise<PlatformExpenseRow | null> {
  try {
    const row = await prisma.platformSystemExpense.update({
      where: { id: input.id },
      data: {
        date: new Date(`${input.date}T00:00:00.000Z`),
        category: input.category as PlatformSystemExpenseCategory,
        title: input.title,
        notes: input.notes,
        currency: input.currency,
        amount: input.amount,
        hours: input.hours,
        vendor: input.vendor,
      },
    });
    return mapRow(row);
  } catch {
    return null;
  }
}

export async function dbDeletePlatformExpense(id: string): Promise<boolean> {
  try {
    await prisma.platformSystemExpense.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export function computeExpenseTotals(rows: PlatformExpenseRow[]) {
  let totalArs = 0;
  let totalUsd = 0;
  let totalHours = 0;
  for (const r of rows) {
    if (r.currency === "ARS") totalArs += r.amount;
    else totalUsd += r.amount;
    if (r.hours != null) totalHours += r.hours;
  }
  return {
    totalArs: Math.round(totalArs * 100) / 100,
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalHours: Math.round(totalHours * 100) / 100,
    count: rows.length,
  };
}
