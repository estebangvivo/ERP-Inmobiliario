"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  createBankAccount,
  updateBankAccount,
} from "@/features/treasury/actions/bank-actions";
import type { BankAccountListItem } from "@/features/treasury/queries/bank-queries";
import { formatMoney } from "@/features/treasury/lib/labels";

type BanksSettingsPanelProps = {
  accounts: BankAccountListItem[];
  enabledCurrencies: string[];
  canManage: boolean;
};

const EMPTY = {
  name: "",
  bankName: "",
  accountNumber: "",
  cbu: "",
  alias: "",
  currency: "ARS",
  openingBalance: "",
  notes: "",
};

export function BanksSettingsPanel({
  accounts,
  enabledCurrencies,
  canManage,
}: BanksSettingsPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountListItem | null>(null);
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setValues({
      ...EMPTY,
      currency: enabledCurrencies[0] ?? "ARS",
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(account: BankAccountListItem) {
    setEditing(account);
    setValues({
      name: account.name,
      bankName: account.bankName,
      accountNumber: account.accountNumber ?? "",
      cbu: account.cbu ?? "",
      alias: account.alias ?? "",
      currency: account.currency,
      openingBalance: "",
      notes: account.notes ?? "",
    });
    setError(null);
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = {
        name: values.name,
        bankName: values.bankName,
        accountNumber: values.accountNumber || undefined,
        cbu: values.cbu || undefined,
        alias: values.alias || undefined,
        currency: values.currency,
        openingBalance: values.openingBalance
          ? Number(values.openingBalance)
          : undefined,
        notes: values.notes || undefined,
      };

      const result = editing
        ? await updateBankAccount(editing.id, payload)
        : await createBankAccount(payload);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  function toggleActive(account: BankAccountListItem) {
    startTransition(async () => {
      const result = await updateBankAccount(account.id, {
        name: account.name,
        bankName: account.bankName,
        accountNumber: account.accountNumber ?? undefined,
        cbu: account.cbu ?? undefined,
        alias: account.alias ?? undefined,
        notes: account.notes ?? undefined,
        isActive: !account.isActive,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl tracking-tight">
            Cuentas bancarias
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Se usan en transferencias de recibos y órdenes de pago. El saldo se
            ve en Tesorería.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]"
          >
            <Plus className="size-4" aria-hidden />
            Nueva cuenta
          </button>
        ) : null}
      </div>

      {error && !open ? (
        <p className="text-sm text-[var(--destructive)]" role="alert">
          {error}
        </p>
      ) : null}

      {accounts.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
          Todavía no hay cuentas. Dá de alta la primera para cobrar o pagar por
          transferencia.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">
                  {account.name}
                  {!account.isActive ? (
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                      (inactiva)
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {[
                    account.bankName,
                    account.accountNumber,
                    account.alias ? `Alias ${account.alias}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium tabular-nums">
                  {formatMoney(account.balance, account.currency)}
                </p>
                {canManage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openEdit(account)}
                      className="text-sm text-[var(--primary)] hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(account)}
                      disabled={pending}
                      className="text-sm text-[var(--muted-foreground)] hover:text-foreground"
                    >
                      {account.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-labelledby="bank-account-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between">
              <h2
                id="bank-account-title"
                className="font-display text-lg tracking-tight"
              >
                {editing ? "Editar cuenta" : "Nueva cuenta bancaria"}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted-foreground)]">
                  Nombre interno
                </span>
                <input
                  required
                  value={values.name}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, name: e.target.value }))
                  }
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted-foreground)]">
                  Banco
                </span>
                <input
                  required
                  value={values.bankName}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, bankName: e.target.value }))
                  }
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-foreground)]">
                    N° cuenta
                  </span>
                  <input
                    value={values.accountNumber}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        accountNumber: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                  />
                </label>
                {!editing ? (
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted-foreground)]">
                      Moneda
                    </span>
                    <select
                      value={values.currency}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, currency: e.target.value }))
                      }
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                    >
                      {enabledCurrencies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted-foreground)]">
                  CBU
                </span>
                <input
                  value={values.cbu}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, cbu: e.target.value }))
                  }
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted-foreground)]">
                  Alias
                </span>
                <input
                  value={values.alias}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, alias: e.target.value }))
                  }
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                />
              </label>
              {!editing ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--muted-foreground)]">
                    Saldo inicial
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={values.openingBalance}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        openingBalance: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                  />
                </label>
              ) : null}
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted-foreground)]">
                  Notas
                </span>
                <textarea
                  value={values.notes}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, notes: e.target.value }))
                  }
                  rows={2}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                />
              </label>

              {error ? (
                <p className="text-sm text-[var(--destructive)]" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-60"
                >
                  {pending ? "Guardando…" : editing ? "Guardar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
