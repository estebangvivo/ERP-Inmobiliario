"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDateAR } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  PLATFORM_EXPENSE_CATEGORIES,
  PLATFORM_EXPENSE_CATEGORY_LABEL,
  type PlatformExpenseCategory,
} from "@/features/platform-expenses/lib/categories";
import {
  createPlatformExpense,
  deletePlatformExpense,
  listPlatformExpenses,
  updatePlatformExpense,
  type PlatformExpenseListResult,
} from "@/features/platform-expenses/actions/platform-expense-actions";
import type { PlatformExpenseRow } from "@/features/platform-expenses/lib/expense-db";

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2";

type FormState = {
  date: string;
  category: PlatformExpenseCategory;
  title: string;
  notes: string;
  currency: "ARS" | "USD";
  amount: string;
  hours: string;
  vendor: string;
};

function emptyForm(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    date: today,
    category: "HOSTING",
    title: "",
    notes: "",
    currency: "ARS",
    amount: "",
    hours: "",
    vendor: "",
  };
}

function rowToForm(row: PlatformExpenseRow): FormState {
  return {
    date: row.date,
    category: row.category,
    title: row.title,
    notes: row.notes ?? "",
    currency: row.currency,
    amount: String(row.amount),
    hours: row.hours != null ? String(row.hours) : "",
    vendor: row.vendor ?? "",
  };
}

function formatMoney(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function AdminSystemExpensesPanel({
  initial,
}: {
  initial: PlatformExpenseListResult;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initial.items);
  const [totals, setTotals] = useState(initial.totals);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ANY");
  const [currencyFilter, setCurrencyFilter] = useState("ANY");
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (from && p.date < from) return false;
      if (to && p.date > to) return false;
      if (categoryFilter !== "ANY" && p.category !== categoryFilter) return false;
      if (currencyFilter !== "ANY" && p.currency !== currencyFilter) return false;
      return true;
    });
  }, [items, from, to, categoryFilter, currencyFilter]);

  const filteredTotals = useMemo(() => {
    let totalArs = 0;
    let totalUsd = 0;
    let totalHours = 0;
    for (const r of filtered) {
      if (r.currency === "ARS") totalArs += r.amount;
      else totalUsd += r.amount;
      if (r.hours != null) totalHours += r.hours;
    }
    return {
      totalArs: Math.round(totalArs * 100) / 100,
      totalUsd: Math.round(totalUsd * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      count: filtered.length,
    };
  }, [filtered]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setError(null);
  }

  function startEdit(row: PlatformExpenseRow) {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setShowForm(true);
    setError(null);
  }

  async function reloadList() {
    const data = await listPlatformExpenses({});
    if (data) {
      setItems(data.items);
      setTotals(data.totals);
    } else {
      setError("No se pudo recargar el listado de gastos.");
    }
    router.refresh();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = {
        date: form.date,
        category: form.category,
        title: form.title,
        notes: form.notes || null,
        currency: form.currency,
        amount: form.amount,
        hours: form.hours || null,
        vendor: form.vendor || null,
      };
      const result = editingId
        ? await updatePlatformExpense({ id: editingId, ...payload })
        : await createPlatformExpense(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await reloadList();
    });
  }

  function onDelete(id: string) {
    if (!window.confirm("¿Eliminar este gasto?")) return;
    startTransition(async () => {
      const result = await deletePlatformExpense(id);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      await reloadList();
    });
  }

  useEffect(() => {
    setItems(initial.items);
    setTotals(initial.totals);
  }, [initial]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 font-display text-xl tracking-tight">
            <Wallet className="size-5" aria-hidden />
            Gastos de sistema
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hosting, horas de desarrollo, herramientas y otros costos de
            mantenimiento del SaaS.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
        >
          <Plus className="size-4" aria-hidden />
          Nuevo gasto
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Total ARS</p>
          <p className="text-lg font-semibold">
            {formatMoney("ARS", filteredTotals.totalArs)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Total USD</p>
          <p className="text-lg font-semibold">
            {formatMoney("USD", filteredTotals.totalUsd)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Horas</p>
          <p className="text-lg font-semibold">
            {filteredTotals.totalHours.toLocaleString("es-AR")}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Ítems</p>
          <p className="text-lg font-semibold">{filteredTotals.count}</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Desde</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Hasta</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Categoría</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={fieldClass}
          >
            <option value="ANY">Todas</option>
            {PLATFORM_EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PLATFORM_EXPENSE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Moneda</span>
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className={fieldClass}
          >
            <option value="ANY">Todas</option>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-border p-4"
        >
          <h3 className="font-medium">
            {editingId ? "Editar gasto" : "Nuevo gasto"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Fecha</span>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                className={fieldClass}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Categoría</span>
              <select
                value={form.category}
                onChange={(e) =>
                  setField(
                    "category",
                    e.target.value as PlatformExpenseCategory,
                  )
                }
                className={fieldClass}
              >
                {PLATFORM_EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {PLATFORM_EXPENSE_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Título</span>
              <input
                required
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                className={fieldClass}
                placeholder="Ej. Railway producción — agosto"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Moneda</span>
              <select
                value={form.currency}
                onChange={(e) =>
                  setField("currency", e.target.value as "ARS" | "USD")
                }
                className={fieldClass}
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Monto</span>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setField("amount", e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">
                Horas (opcional)
              </span>
              <input
                type="number"
                min={0}
                step="0.25"
                value={form.hours}
                onChange={(e) => setField("hours", e.target.value)}
                className={fieldClass}
                placeholder="Ej. 4"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">
                Proveedor (opcional)
              </span>
              <input
                value={form.vendor}
                onChange={(e) => setField("vendor", e.target.value)}
                className={fieldClass}
                placeholder="Railway, Cursor…"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Notas</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
          {error && (
            <p className="rounded-md border border-red-700/40 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setError(null);
              }}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
              <th className="px-3 py-2 font-medium">Monto</th>
              <th className="px-3 py-2 font-medium">Horas</th>
              <th className="px-3 py-2 font-medium"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No hay gastos con estos filtros.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatDateAR(row.date)}
                  </td>
                  <td className="px-3 py-2.5">
                    {PLATFORM_EXPENSE_CATEGORY_LABEL[row.category]}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{row.title}</p>
                    {(row.vendor || row.notes) && (
                      <p className="text-xs text-muted-foreground">
                        {[row.vendor, row.notes].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {formatMoney(row.currency, row.amount)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.hours != null
                      ? row.hours.toLocaleString("es-AR")
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => startEdit(row)}
                        className={cn(
                          "rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground",
                        )}
                        aria-label="Editar"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onDelete(row.id)}
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-red-700"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Totales del período cargado (sin filtro local):{" "}
        {formatMoney("ARS", totals.totalArs)} ·{" "}
        {formatMoney("USD", totals.totalUsd)} · {totals.count} ítems.
      </p>
    </div>
  );
}
