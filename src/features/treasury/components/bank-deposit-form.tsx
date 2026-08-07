"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  depositCashToBank,
  depositChecksToBank,
  withdrawCashFromBank,
} from "@/features/treasury/actions/bank-deposit-actions";
import { formatMoney } from "@/features/treasury/lib/labels";

export type DepositBankOption = {
  id: string;
  name: string;
  bankName: string;
  currency: string;
  balance: number;
  label: string;
};

export type DepositCheckOption = {
  id: string;
  number: string;
  bank: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  label: string;
};

type BankDepositFormProps = {
  banks: DepositBankOption[];
  checks: DepositCheckOption[];
  dailyBalances: Record<string, number>;
  treasuryBalances: Record<string, number>;
  canManage: boolean;
  defaultBankId?: string;
};

type Mode = "CASH" | "CHECK" | "WITHDRAW";

export function BankDepositForm({
  banks,
  checks,
  dailyBalances,
  treasuryBalances,
  canManage,
  defaultBankId = "",
}: BankDepositFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("CASH");
  const [bankAccountId, setBankAccountId] = useState(
    defaultBankId || banks[0]?.id || "",
  );
  const [cashSource, setCashSource] = useState<"DAILY" | "TREASURY">(
    "TREASURY",
  );
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedChecks, setSelectedChecks] = useState<string[]>([]);

  const selectedBank = banks.find((b) => b.id === bankAccountId);
  const currency = selectedBank?.currency ?? "ARS";
  const bankBalance = selectedBank?.balance ?? 0;

  const checksForBank = useMemo(
    () => checks.filter((c) => c.currency === currency),
    [checks, currency],
  );

  const selectedCheckTotal = useMemo(
    () =>
      checksForBank
        .filter((c) => selectedChecks.includes(c.id))
        .reduce((acc, c) => acc + c.amount, 0),
    [checksForBank, selectedChecks],
  );

  const availableCash =
    cashSource === "DAILY"
      ? (dailyBalances[currency] ?? 0)
      : (treasuryBalances[currency] ?? 0);

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        No tenés permiso para registrar movimientos bancarios.
      </p>
    );
  }

  if (banks.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Primero dá de alta una cuenta bancaria en Configuración.
      </p>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result =
        mode === "CASH"
          ? await depositCashToBank({
              bankAccountId,
              amount: Number(amount),
              cashSource,
              notes: notes || undefined,
            })
          : mode === "WITHDRAW"
            ? await withdrawCashFromBank({
                bankAccountId,
                amount: Number(amount),
                cashDestination: cashSource,
                notes: notes || undefined,
              })
            : await depositChecksToBank({
                bankAccountId,
                checkIds: selectedChecks,
                notes: notes || undefined,
              });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setAmount("");
      setNotes("");
      setSelectedChecks([]);
      router.push(`/tesoreria/bancos/${result.id}`);
      router.refresh();
    });
  }

  function toggleCheck(id: string) {
    setSelectedChecks((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const modeBtn = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      className={
        mode === value
          ? "rounded-md border border-foreground bg-foreground px-3 py-1.5 text-sm text-background"
          : "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface"
      }
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {modeBtn("CASH", "Depositar efectivo")}
        {modeBtn("CHECK", "Depositar cheques")}
        {modeBtn("WITHDRAW", "Extraer efectivo")}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">
          {mode === "WITHDRAW"
            ? "Cuenta bancaria origen"
            : "Cuenta bancaria destino"}
        </span>
        <select
          required
          value={bankAccountId}
          onChange={(e) => {
            setBankAccountId(e.target.value);
            setSelectedChecks([]);
          }}
          className="w-full max-w-lg rounded-md border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
        >
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} · saldo {formatMoney(b.balance, b.currency)}
            </option>
          ))}
        </select>
      </label>

      {mode === "CHECK" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Cheques en cartera ({currency}). Se acreditan al banco y salen de
            cartera.
          </p>
          {checksForBank.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No hay cheques en cartera en {currency}.
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {checksForBank.map((c) => {
                const checked = selectedChecks.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-surface/60">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCheck(c.id)}
                        className="mt-1"
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">{c.number}</span>
                        {" · "}
                        {c.bank}
                        {" · "}
                        <span className="tabular-nums">
                          {formatMoney(c.amount, c.currency)}
                        </span>
                        {c.dueDate ? ` · vto ${c.dueDate}` : ""}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {selectedChecks.length > 0 && (
            <p className="text-sm font-medium tabular-nums">
              Total a depositar: {formatMoney(selectedCheckTotal, currency)}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">
              {mode === "WITHDRAW"
                ? "Destino del efectivo"
                : "Origen del efectivo"}
            </span>
            <select
              value={cashSource}
              onChange={(e) =>
                setCashSource(e.target.value as "DAILY" | "TREASURY")
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
            >
              <option value="TREASURY">
                Caja tesorería (
                {formatMoney(treasuryBalances[currency] ?? 0, currency)})
              </option>
              <option value="DAILY">
                Caja diaria (
                {formatMoney(dailyBalances[currency] ?? 0, currency)})
              </option>
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              {mode === "WITHDRAW" ? (
                <>
                  Disponible en banco: {formatMoney(bankBalance, currency)}
                  {cashSource === "DAILY"
                    ? " · requiere caja diaria abierta"
                    : ""}
                </>
              ) : (
                <>
                  Disponible en caja: {formatMoney(availableCash, currency)}
                  {cashSource === "DAILY"
                    ? " · requiere caja diaria abierta"
                    : ""}
                </>
              )}
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Monto</span>
            <input
              type="number"
              min={0.01}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
            />
          </label>
        </div>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">
          Notas (opcional)
        </span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full max-w-lg rounded-md border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
        />
      </label>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending
          ? "Registrando…"
          : mode === "CASH"
            ? "Depositar efectivo"
            : mode === "WITHDRAW"
              ? "Extraer efectivo"
              : "Depositar cheques"}
      </button>
    </form>
  );
}
