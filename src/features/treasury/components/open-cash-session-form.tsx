"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openDailyCashSession } from "@/features/treasury/actions/cash-actions";
import { DateInput } from "@/components/ui/date-input";
import { toDateInputValue } from "@/lib/format-date";

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent focus:ring-2";

type Props = {
  currency?: string;
};

export function OpenCashSessionForm({ currency = "ARS" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [businessDate, setBusinessDate] = useState(
    toDateInputValue(new Date()),
  );
  const [openingBalance, setOpeningBalance] = useState(0);
  const [notes, setNotes] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await openDailyCashSession({
        businessDate,
        openingBalance,
        currency,
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/tesoreria/caja/sesiones/${result.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Fecha</span>
          <DateInput
            required
            value={businessDate}
            onChange={setBusinessDate}
            className="w-full bg-surface"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">
            Fondo de apertura ({currency})
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-muted-foreground">Notas</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={fieldClass}
            placeholder="Opcional"
          />
        </label>
      </div>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-60"
      >
        {pending ? "Abriendo…" : "Abrir caja diaria"}
      </button>
    </form>
  );
}
