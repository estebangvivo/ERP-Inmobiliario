"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { registerRecoverableRecoveryAction } from "@/server/actions/recoverable-charges";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

export function RecoverableRecoveryForm({
  charges,
  workOrders = [],
  receipts = [],
}: {
  charges: {
    id: string;
    label: string;
    pending: number;
    currency: string;
  }[];
  workOrders?: { id: string; label: string }[];
  receipts?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    registerRecoverableRecoveryAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (charges.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No hay saldos abiertos para recuperar.
      </p>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2"
    >
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="chargeId">Cargo pendiente</Label>
        <Select id="chargeId" name="chargeId" required defaultValue={charges[0]?.id}>
          {charges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · pendiente {c.pending.toLocaleString("es-AR")} {c.currency}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="amount">Monto recupero</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          defaultValue={charges[0]?.pending || ""}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="recoveredAt">Fecha</Label>
        <DateInput id="recoveredAt" name="recoveredAt" required defaultValue={today} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="method">Método</Label>
        <Select id="method" name="method" defaultValue="MANUAL">
          <option value="MANUAL">Manual / otra obra</option>
          <option value="RECEIPT">Recibo de tesorería</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="receiptId">Recibo (opcional)</Label>
        <Select id="receiptId" name="receiptId" defaultValue="">
          <option value="">Sin vincular</option>
          {receipts.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="referenceWorkOrderId">OT de referencia (blanqueo / otra obra)</Label>
        <Select id="referenceWorkOrderId" name="referenceWorkOrderId" defaultValue="">
          <option value="">Sin referencia</option>
          {workOrders.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <Input id="notes" name="notes" placeholder="Ej. cubierto con OT XXX / cobro aparte" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Registrar recupero"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-2">{state.error}</p>
      ) : null}
      {state?.ok && state.message ? (
        <p className="text-sm text-emerald-700 sm:col-span-2">{state.message}</p>
      ) : null}
    </form>
  );
}
