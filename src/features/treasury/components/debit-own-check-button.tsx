"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { debitOwnCheck } from "@/features/treasury/actions/own-check-actions";

type DebitOwnCheckButtonProps = {
  checkId: string;
  dueDateLabel: string;
  /** true si hoy >= vencimiento (o sin vto). */
  dueReached: boolean;
  bankLabel?: string | null;
};

export function DebitOwnCheckButton({
  checkId,
  dueDateLabel,
  dueReached,
  bankLabel,
}: DebitOwnCheckButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!dueReached) {
    return (
      <p className="text-xs text-muted-foreground">
        Disponible desde el vto {dueDateLabel}
      </p>
    );
  }

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await debitOwnCheck(checkId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded-md border border-foreground bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
      >
        Debitar del banco
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-labelledby="debit-own-check-title"
            className="w-full max-w-md rounded-lg border border-border bg-surface-elevated p-5 shadow-lg"
          >
            <h2
              id="debit-own-check-title"
              className="font-display text-lg tracking-tight"
            >
              Debitar cheque propio
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Se debitará la cuenta emisora
              {bankLabel ? (
                <>
                  {" "}
                  (<span className="text-foreground">{bankLabel}</span>)
                </>
              ) : null}{" "}
              y el cheque pasará a Depositado. Vencimiento: {dueDateLabel}.
            </p>
            {error ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onConfirm}
                className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
              >
                {pending ? "Debitando…" : "Confirmar débito"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
