"use server";

import { revalidatePath } from "next/cache";
import { requireAuthSession } from "@/lib/auth";
import { requirePlatformSuperadmin } from "@/features/auth/lib/platform-admin";
import {
  isPlatformExpenseCategory,
  type PlatformExpenseCategory,
} from "@/features/platform-expenses/lib/categories";
import {
  computeExpenseTotals,
  dbCreatePlatformExpense,
  dbDeletePlatformExpense,
  dbListPlatformExpenses,
  dbUpdatePlatformExpense,
  type PlatformExpenseRow,
} from "@/features/platform-expenses/lib/expense-db";

export type PlatformExpenseListResult = {
  items: PlatformExpenseRow[];
  totals: {
    totalArs: number;
    totalUsd: number;
    totalHours: number;
    count: number;
  };
};

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

function parseIsoDate(raw: string): string | null {
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return t;
}

function parseCurrency(raw: string): "ARS" | "USD" | null {
  const c = raw.trim().toUpperCase();
  if (c === "ARS" || c === "USD") return c;
  return null;
}

function parseAmount(raw: number | string): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseHours(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

async function requireSuperadminSession() {
  const session = await requireAuthSession();
  requirePlatformSuperadmin(session);
  return session;
}

export async function listPlatformExpenses(filters?: {
  from?: string | null;
  to?: string | null;
  category?: string | null;
  currency?: string | null;
}): Promise<PlatformExpenseListResult | null> {
  try {
    await requireSuperadminSession();
    const items = await dbListPlatformExpenses(filters ?? {});
    return { items, totals: computeExpenseTotals(items) };
  } catch (error) {
    console.error("listPlatformExpenses", error);
    return null;
  }
}

export async function createPlatformExpense(input: {
  date: string;
  category: string;
  title: string;
  notes?: string | null;
  currency: string;
  amount: number | string;
  hours?: number | string | null;
  vendor?: string | null;
}): Promise<ActionResult> {
  try {
    const session = await requireSuperadminSession();
    const date = parseIsoDate(input.date);
    if (!date) return { ok: false, error: "Fecha inválida." };
    if (!isPlatformExpenseCategory(input.category)) {
      return { ok: false, error: "Categoría inválida." };
    }
    const title = input.title.trim();
    if (title.length < 2) return { ok: false, error: "Indicá un título." };
    const currency = parseCurrency(input.currency);
    if (!currency) return { ok: false, error: "Moneda inválida." };
    const amount = parseAmount(input.amount);
    if (amount == null) return { ok: false, error: "Monto inválido." };
    const hours = parseHours(input.hours);

    await dbCreatePlatformExpense({
      date,
      category: input.category as PlatformExpenseCategory,
      title,
      notes: input.notes?.trim() || null,
      currency,
      amount,
      hours,
      vendor: input.vendor?.trim() || null,
      createdByUserId: session.user.id,
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("createPlatformExpense", error);
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return { ok: false, error: "Sin permiso de superadmin." };
    }
    return { ok: false, error: "No se pudo guardar el gasto." };
  }
}

export async function updatePlatformExpense(input: {
  id: string;
  date: string;
  category: string;
  title: string;
  notes?: string | null;
  currency: string;
  amount: number | string;
  hours?: number | string | null;
  vendor?: string | null;
}): Promise<ActionResult> {
  try {
    await requireSuperadminSession();
    if (!input.id.trim()) return { ok: false, error: "Gasto inválido." };
    const date = parseIsoDate(input.date);
    if (!date) return { ok: false, error: "Fecha inválida." };
    if (!isPlatformExpenseCategory(input.category)) {
      return { ok: false, error: "Categoría inválida." };
    }
    const title = input.title.trim();
    if (title.length < 2) return { ok: false, error: "Indicá un título." };
    const currency = parseCurrency(input.currency);
    if (!currency) return { ok: false, error: "Moneda inválida." };
    const amount = parseAmount(input.amount);
    if (amount == null) return { ok: false, error: "Monto inválido." };
    const hours = parseHours(input.hours);

    const updated = await dbUpdatePlatformExpense({
      id: input.id.trim(),
      date,
      category: input.category as PlatformExpenseCategory,
      title,
      notes: input.notes?.trim() || null,
      currency,
      amount,
      hours,
      vendor: input.vendor?.trim() || null,
    });
    if (!updated) return { ok: false, error: "Gasto no encontrado." };

    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("updatePlatformExpense", error);
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return { ok: false, error: "Sin permiso de superadmin." };
    }
    return { ok: false, error: "No se pudo actualizar el gasto." };
  }
}

export async function deletePlatformExpense(
  id: string,
): Promise<ActionResult> {
  try {
    await requireSuperadminSession();
    if (!id.trim()) return { ok: false, error: "Gasto inválido." };
    const ok = await dbDeletePlatformExpense(id.trim());
    if (!ok) return { ok: false, error: "Gasto no encontrado." };
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("deletePlatformExpense", error);
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return { ok: false, error: "Sin permiso de superadmin." };
    }
    return { ok: false, error: "No se pudo eliminar el gasto." };
  }
}
