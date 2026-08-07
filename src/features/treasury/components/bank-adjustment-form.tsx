"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBankAdjustment } from "@/features/treasury/actions/bank-actions";

type BankAdjustmentFormProps = {
  bankAccountId: string;
  canManage: boolean;
};

export function BankAdjustmentForm({
  bankAccountId,
  canManage,
}: BankAdjustmentFormProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        No tenés permiso para registrar ajustes.
      </p>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addBankAdjustment({
        bankAccountId,
        amount: Number(amount),
        description,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAmount("");
      setDescription("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">
          Monto (+ ingreso / − egreso)
        </span>
        <input
          type="number"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block text-muted-foreground">Descripción</span>
        <input
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
        />
      </label>
      {error && (
        <p className="text-sm text-danger sm:col-span-3" role="alert">
          {error}
        </p>
      )}
      <div className="sm:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Registrar ajuste"}
        </button>
      </div>
    </form>
  );
}
