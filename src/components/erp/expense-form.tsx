"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createExpenseAction } from "@/server/actions/expenses";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

export function ExpenseForm({
  complexes,
}: {
  complexes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const now = new Date();
  const [state, formAction, pending] = useActionState(createExpenseAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1 lg:col-span-2">
        <Label htmlFor="complexId">Complejo</Label>
        <Select id="complexId" name="complexId" required defaultValue="">
          <option value="" disabled>Seleccionar…</option>
          {complexes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="type">Tipo</Label>
        <Select id="type" name="type" defaultValue="ORDINARY">
          <option value="ORDINARY">Ordinaria</option>
          <option value="EXTRAORDINARY">Extraordinaria</option>
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="concept">Concepto</Label>
        <Input id="concept" name="concept" required placeholder="Expensas ordinarias marzo" />
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
        <Label htmlFor="totalAmount">Monto total</Label>
        <Input id="totalAmount" name="totalAmount" type="number" step="0.01" required />
      </div>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" name="billToTenant" defaultChecked className="h-4 w-4" />
        Facturar a inquilinos
      </label>
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Prorrateando…" : "Crear y prorratear"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-full">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-emerald-700 sm:col-span-full">Expensa creada y asignada por coeficiente.</p>
      ) : null}
    </form>
  );
}
