"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDailyCashMovement,
  closeDailyCashSession,
} from "@/features/treasury/actions/cash-actions";
import { formatCashMoney, round2 } from "@/features/treasury/lib/cash-labels";
import type { CashSessionDetail } from "@/features/treasury/queries/cash-queries";

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent focus:ring-2";

type Props = {
  session: CashSessionDetail;
  canManage: boolean;
};

export function CashSessionControls({ session, canManage }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"INCOME" | "EXPENSE" | "ADJUSTMENT">(
    "INCOME",
  );
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [countedBalance, setCountedBalance] = useState(
    round2(session.runningBalance),
  );
  const [transferToTreasury, setTransferToTreasury] = useState(true);
  const [closeNotes, setCloseNotes] = useState("");

  if (!canManage || session.status !== "OPEN") return null;

  function addMovement(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addDailyCashMovement({
        sessionId: session.id,
        kind,
        amount:
          kind === "ADJUSTMENT"
            ? amount
            : Math.abs(amount),
        description,
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

  function closeSession(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (
      !window.confirm(
        transferToTreasury
          ? `¿Cerrar caja y transferir ${formatCashMoney(countedBalance, session.currency)} a tesorería?`
          : "¿Cerrar caja sin transferir a tesorería?",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await closeDailyCashSession({
        sessionId: session.id,
        countedBalance,
        transferToTreasury,
        notes: closeNotes || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-medium">Registrar movimiento</h3>
        <form onSubmit={addMovement} className="grid gap-3 sm:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Tipo</span>
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "INCOME" | "EXPENSE" | "ADJUSTMENT")
              }
              className={fieldClass}
            >
              <option value="INCOME">Ingreso</option>
              <option value="EXPENSE">Egreso</option>
              <option value="ADJUSTMENT">Ajuste (+/−)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Monto</span>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className={fieldClass}
              required
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-muted-foreground">Descripción</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={fieldClass}
              required
              placeholder="Ej. Cobro cliente / pago proveedor"
            />
          </label>
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-surface disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Agregar movimiento"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded-md border border-border p-4">
        <h3 className="font-medium">Cerrar caja (arqueo)</h3>
        <p className="text-sm text-muted-foreground">
          Saldo sistema:{" "}
          <span className="font-medium text-foreground">
            {formatCashMoney(session.runningBalance, session.currency)}
          </span>
          . Contá el efectivo y transferí el cierre a caja tesorería.
        </p>
        <form onSubmit={closeSession} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">
              Efectivo contado
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={countedBalance}
              onChange={(e) => setCountedBalance(Number(e.target.value))}
              className={fieldClass}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Diferencia</span>
            <input
              readOnly
              value={formatCashMoney(
                round2(countedBalance - session.runningBalance),
                session.currency,
              )}
              className={`${fieldClass} text-muted-foreground`}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={transferToTreasury}
              onChange={(e) => setTransferToTreasury(e.target.checked)}
            />
            Transferir el efectivo contado a caja tesorería
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-muted-foreground">
              Notas de cierre
            </span>
            <input
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              className={fieldClass}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              {pending ? "Cerrando…" : "Cerrar caja diaria"}
            </button>
          </div>
        </form>
      </section>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
