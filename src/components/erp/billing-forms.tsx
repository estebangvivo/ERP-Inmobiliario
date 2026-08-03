"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  generatePeriodBillsAction,
  recordPaymentAction,
} from "@/server/actions/billing";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

export function GenerateBillsForm() {
  const router = useRouter();
  const now = new Date();
  const [state, formAction, pending] = useActionState(generatePeriodBillsAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="space-y-1">
        <Label htmlFor="periodYear">Año</Label>
        <Input id="periodYear" name="periodYear" type="number" defaultValue={now.getFullYear()} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="periodMonth">Mes</Label>
        <Input id="periodMonth" name="periodMonth" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Generando…" : "Generar cuotas del período"}
      </Button>
      {state?.ok && state.message ? (
        <p className="w-full text-sm text-emerald-700">{state.message}</p>
      ) : null}
      {state && !state.ok ? (
        <p className="w-full text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}
    </form>
  );
}

export function PaymentForm({
  billId,
  balance,
}: {
  billId: string;
  balance: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(recordPaymentAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
      <input type="hidden" name="tenantBillId" value={billId} />
      <div className="space-y-1">
        <Label htmlFor="amount">Monto (saldo {balance.toFixed(2)})</Label>
        <Input id="amount" name="amount" type="number" step="0.01" defaultValue={balance > 0 ? balance : undefined} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="method">Medio</Label>
        <Select id="method" name="method" defaultValue="BANK_TRANSFER">
          <option value="BANK_TRANSFER">Transferencia</option>
          <option value="CASH">Efectivo</option>
          <option value="CHECK">Cheque</option>
          <option value="CARD">Tarjeta</option>
          <option value="GATEWAY">Pasarela</option>
          <option value="OTHER">Otro</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="reference">Referencia / comprobante</Label>
        <Input id="reference" name="reference" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">Notas</Label>
        <Input id="notes" name="notes" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || balance <= 0}>
          {pending ? "Registrando…" : "Registrar pago"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-2">{state.error}</p>
      ) : null}
    </form>
  );
}
