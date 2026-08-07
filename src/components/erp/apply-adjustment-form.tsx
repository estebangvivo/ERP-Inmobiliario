"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyContractAdjustmentAction } from "@/server/actions/contracts";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

export function ApplyAdjustmentForm({
  contractId,
  currentRentLabel,
}: {
  contractId: string;
  currentRentLabel: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    applyContractAdjustmentAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <input type="hidden" name="contractId" value={contractId} />
      <div>
        <h3 className="text-base font-semibold">Aplicar ajuste de índice</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Alquiler vigente: {currentRentLabel}. Ingresá el % publicado (ICL/IPC/custom)
          y se calculará el nuevo monto.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="percent">Porcentaje (%)</Label>
          <Input
            id="percent"
            name="percent"
            type="number"
            step="0.001"
            min="0.001"
            required
            placeholder="ej. 12.5"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="effectiveFrom">Vigente desde</Label>
          <Input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            defaultValue={today}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" placeholder="Opcional" />
        </div>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-[var(--primary)]">
          {state.message ?? "Ajuste aplicado."}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Aplicando…" : "Aplicar ajuste"}
      </Button>
    </form>
  );
}
