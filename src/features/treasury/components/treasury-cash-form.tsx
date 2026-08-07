"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTreasuryMovement } from "@/features/treasury/actions/cash-actions";

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent focus:ring-2";

type Props = {
  currency?: string;
  canManage: boolean;
};

export function TreasuryCashForm({ currency = "ARS", canManage }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"TREASURY_DEPOSIT" | "TREASURY_WITHDRAWAL">(
    "TREASURY_DEPOSIT",
  );
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");

  if (!canManage) return null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addTreasuryMovement({
        kind,
        amount,
        description,
        currency,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAmount(0);
      setDescription("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4">
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Tipo</span>
        <select
          value={kind}
          onChange={(e) =>
            setKind(
              e.target.value as "TREASURY_DEPOSIT" | "TREASURY_WITHDRAWAL",
            )
          }
          className={fieldClass}
        >
          <option value="TREASURY_DEPOSIT">Depósito</option>
          <option value="TREASURY_WITHDRAWAL">Extracción</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Monto</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className={fieldClass}
          required
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block text-muted-foreground">Concepto</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={fieldClass}
          required
        />
      </label>
      {error && (
        <p className="text-sm text-danger sm:col-span-4" role="alert">
          {error}
        </p>
      )}
      <div className="sm:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Registrar"}
        </button>
      </div>
    </form>
  );
}
