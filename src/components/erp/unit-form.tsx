"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUnitAction } from "@/server/actions/complexes";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

export function UnitForm({ complexId }: { complexId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createUnitAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-3 lg:grid-cols-6">
      <input type="hidden" name="complexId" value={complexId} />
      <div className="space-y-1">
        <Label htmlFor="code">Código</Label>
        <Input id="code" name="code" placeholder="2A" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="floor">Piso</Label>
        <Input id="floor" name="floor" placeholder="2" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ownershipCoefficient">Coeficiente</Label>
        <Input id="ownershipCoefficient" name="ownershipCoefficient" type="number" step="0.000001" placeholder="0.25" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="areaM2">m²</Label>
        <Input id="areaM2" name="areaM2" type="number" step="0.01" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rooms">Ambientes</Label>
        <Input id="rooms" name="rooms" type="number" />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "…" : "Agregar unidad"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-full">{state.error}</p>
      ) : null}
    </form>
  );
}
