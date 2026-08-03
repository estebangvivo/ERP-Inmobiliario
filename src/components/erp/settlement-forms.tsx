"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  generateSettlementAction,
  issueSettlementAction,
  paySettlementAction,
} from "@/server/actions/settlements";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

export function GenerateSettlementForm({
  owners,
}: {
  owners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const now = new Date();
  const [state, formAction, pending] = useActionState(generateSettlementAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1 lg:col-span-2">
        <Label htmlFor="ownerId">Propietario</Label>
        <Select id="ownerId" name="ownerId" required defaultValue="">
          <option value="" disabled>Seleccionar…</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="periodYear">Año</Label>
        <Input id="periodYear" name="periodYear" type="number" defaultValue={now.getFullYear()} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="periodMonth">Mes</Label>
        <Input id="periodMonth" name="periodMonth" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="currency">Moneda</Label>
        <Select id="currency" name="currency" defaultValue="ARS">
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </Select>
      </div>
      <div className="lg:col-span-5">
        <Button type="submit" disabled={pending}>
          {pending ? "Calculando…" : "Generar liquidación"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] lg:col-span-5">{state.error}</p>
      ) : null}
    </form>
  );
}

export function SettlementActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [payState, payAction, payPending] = useActionState(paySettlementAction, initial);

  useEffect(() => {
    if (payState?.ok) router.refresh();
  }, [payState, router]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {status === "DRAFT" ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await issueSettlementAction(id);
              router.refresh();
            })
          }
        >
          Emitir
        </Button>
      ) : null}

      {status === "ISSUED" ? (
        <form action={payAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={id} />
          <div className="space-y-1">
            <Label htmlFor="transferRef">Ref. transferencia</Label>
            <Input id="transferRef" name="transferRef" />
          </div>
          <Button type="submit" disabled={payPending}>
            Marcar pagada
          </Button>
        </form>
      ) : null}
    </div>
  );
}
