"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ServiceCostCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SERVICE_COST_CATEGORY_LABELS } from "@/lib/labels";
import {
  createServiceCostAction,
  deleteServiceCostAction,
  generateFromServiceCostsAction,
} from "@/server/actions/expenses";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;
const CATEGORIES = Object.keys(
  SERVICE_COST_CATEGORY_LABELS,
) as ServiceCostCategory[];

export function ServiceCostForm({
  complexes,
  properties,
}: {
  complexes: { id: string; name: string }[];
  properties: { id: string; title: string }[];
}) {
  const router = useRouter();
  const now = new Date();
  const [scope, setScope] = useState<"complex" | "property">("complex");
  const [state, formAction, pending] = useActionState(
    createServiceCostAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div className="space-y-1">
        <Label htmlFor="scope">Aplicar a</Label>
        <Select
          id="scope"
          name="scope"
          value={scope}
          onChange={(e) =>
            setScope(e.target.value === "property" ? "property" : "complex")
          }
        >
          <option value="complex">Edificio (prorratea por m² a todas las unidades)</option>
          <option value="property">Propiedad individual</option>
        </Select>
      </div>
      {scope === "complex" ? (
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="complexId">Edificio</Label>
          <Select id="complexId" name="complexId" required defaultValue="">
            <option value="" disabled>
              Seleccionar…
            </option>
            {complexes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="propertyId">Propiedad</Label>
          <Select id="propertyId" name="propertyId" required defaultValue="">
            <option value="" disabled>
              Seleccionar…
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="category">Categoría</Label>
        <Select id="category" name="category" defaultValue="WATER">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SERVICE_COST_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="concept">Concepto</Label>
        <Input
          id="concept"
          name="concept"
          required
          placeholder="Ej. Factura AYSA marzo"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="periodYear">Año</Label>
        <Input
          id="periodYear"
          name="periodYear"
          type="number"
          defaultValue={now.getFullYear()}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="periodMonth">Mes</Label>
        <Input
          id="periodMonth"
          name="periodMonth"
          type="number"
          min={1}
          max={12}
          defaultValue={now.getMonth() + 1}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="amount">Monto</Label>
        <Input id="amount" name="amount" type="number" step="0.01" required />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <Input id="notes" name="notes" placeholder="Opcional" />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Guardando…" : "Cargar gasto"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-full">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-emerald-700 sm:col-span-full">
          {state.message ?? "Gasto cargado."}
        </p>
      ) : null}
    </form>
  );
}

export function GenerateFromCostsForm({
  complexes,
}: {
  complexes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const now = new Date();
  const [state, formAction, pending] = useActionState(
    generateFromServiceCostsAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="space-y-1 lg:col-span-2">
        <Label htmlFor="genComplexId">Edificio</Label>
        <Select id="genComplexId" name="complexId" required defaultValue="">
          <option value="" disabled>
            Seleccionar…
          </option>
          {complexes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="genYear">Año</Label>
        <Input
          id="genYear"
          name="periodYear"
          type="number"
          defaultValue={now.getFullYear()}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="genMonth">Mes</Label>
        <Input
          id="genMonth"
          name="periodMonth"
          type="number"
          min={1}
          max={12}
          defaultValue={now.getMonth() + 1}
          required
        />
      </div>
      <label className="flex items-end gap-2 pb-2 text-sm lg:col-span-2">
        <input
          type="checkbox"
          name="billToTenant"
          defaultChecked
          className="h-4 w-4"
        />
        Facturar a inquilinos
      </label>
      <div className="flex items-end lg:col-span-2">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Generando…" : "Generar expensas del período"}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)] sm:col-span-full">
        Calcula la cuota por unidad: gastos del edificio × (m² de la unidad ÷
        m² totales del edificio), más los gastos cargados a cada propiedad.
        Obras van como extraordinarias; el resto como ordinarias. Reemplaza la
        generación anterior del mismo período si ya existía. Todas las unidades
        deben tener superficie cargada.
      </p>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-full">
          {state.error}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p className="text-sm text-emerald-700 sm:col-span-full">{state.message}</p>
      ) : null}
    </form>
  );
}

export function DeleteServiceCostButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteServiceCostAction(id);
          router.refresh();
        })
      }
    >
      {pending ? "…" : "Eliminar"}
    </Button>
  );
}
