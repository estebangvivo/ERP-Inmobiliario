"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CostLedger, ServiceCostCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";
import { SERVICE_COST_CATEGORY_LABELS } from "@/lib/labels";
import {
  createServiceCostAction,
  deleteServiceCostAction,
  generateFromServiceCostsAction,
} from "@/server/actions/expenses";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

const EXPENSE_CATEGORIES: ServiceCostCategory[] = [
  "WATER",
  "GAS",
  "ELECTRICITY",
  "MUNICIPAL",
  "WORKS",
  "OTHER",
];

const SERVICE_CATEGORIES: ServiceCostCategory[] = [
  ...EXPENSE_CATEGORIES,
  "COMMON",
];

export function ServiceCostForm({
  complexes,
  properties,
  ledger = "EXPENSES",
}: {
  complexes: { id: string; name: string }[];
  properties: { id: string; title: string }[];
  ledger?: CostLedger;
}) {
  const router = useRouter();
  const now = new Date();
  const [scope, setScope] = useState<"complex" | "property">("complex");
  const [propertyId, setPropertyId] = useState("");
  const [state, formAction, pending] = useActionState(
    createServiceCostAction,
    initial,
  );
  const categories =
    ledger === "SERVICES" ? SERVICE_CATEGORIES : EXPENSE_CATEGORIES;
  const propertyOptions = useMemo<SearchableOption[]>(
    () =>
      properties.map((p) => ({
        value: p.id,
        label: p.title,
      })),
    [properties],
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (scope !== "property") setPropertyId("");
  }, [scope]);

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <input type="hidden" name="ledger" value={ledger} />
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
          <SearchableSelect
            id="propertyId"
            name="propertyId"
            value={propertyId}
            onChange={setPropertyId}
            options={propertyOptions}
            emptyLabel="Seleccionar…"
            placeholder="Seleccionar propiedad…"
            searchPlaceholder="Buscar propiedad…"
            required
          />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="category">Categoría</Label>
        <Select id="category" name="category" defaultValue="WATER">
          {categories.map((c) => (
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
  properties,
  ledger = "EXPENSES",
}: {
  complexes: { id: string; name: string }[];
  properties: { id: string; title: string }[];
  ledger?: CostLedger;
}) {
  const router = useRouter();
  const now = new Date();
  const [generateScope, setGenerateScope] = useState<
    "complex" | "property" | "all_pending"
  >("complex");
  const [propertyId, setPropertyId] = useState("");
  const [state, formAction, pending] = useActionState(
    generateFromServiceCostsAction,
    initial,
  );
  const noun = ledger === "SERVICES" ? "servicios" : "expensas";
  const propertyOptions = useMemo<SearchableOption[]>(
    () =>
      properties.map((p) => ({
        value: p.id,
        label: p.title,
      })),
    [properties],
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (generateScope !== "property") setPropertyId("");
  }, [generateScope]);

  const submitLabel =
    generateScope === "all_pending"
      ? `Generar todos los ${noun} pendientes`
      : generateScope === "property"
        ? `Generar ${noun} de la propiedad`
        : `Generar ${noun} del edificio`;

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input type="hidden" name="ledger" value={ledger} />
      <input type="hidden" name="generateScope" value={generateScope} />
      <div className="space-y-1 sm:col-span-2 lg:col-span-4">
        <Label htmlFor="genScope">Alcance</Label>
        <Select
          id="genScope"
          value={generateScope}
          onChange={(e) =>
            setGenerateScope(
              e.target.value as "complex" | "property" | "all_pending",
            )
          }
        >
          <option value="complex">Un edificio</option>
          <option value="property">Una propiedad</option>
          <option value="all_pending">
            Todas las pendientes del período
          </option>
        </Select>
      </div>
      {generateScope === "complex" ? (
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
      ) : null}
      {generateScope === "property" ? (
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="genPropertyId">Propiedad</Label>
          <SearchableSelect
            id="genPropertyId"
            name="propertyId"
            value={propertyId}
            onChange={setPropertyId}
            options={propertyOptions}
            emptyLabel="Seleccionar…"
            placeholder="Seleccionar propiedad…"
            searchPlaceholder="Buscar propiedad…"
            required
          />
        </div>
      ) : null}
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
          {pending ? "Generando…" : submitLabel}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)] sm:col-span-full">
        {generateScope === "all_pending"
          ? `Recorre todos los edificios y propiedades con gastos de ${noun} cargados que aún no tienen documentos del período.`
          : generateScope === "property"
            ? `Genera solo con los gastos cargados a esa propiedad. Si el edificio ya se generó para el período, no hace falta (ya están incluidos).`
            : `Calcula la cuota por unidad: gastos del edificio × (m² ÷ total), más gastos de cada propiedad. Omite propiedades ya generadas individualmente.`}{" "}
        Obras van como extraordinarias; el resto como ordinarias
        {ledger === "SERVICES" ? " (incluye gasto común)" : ""}. Si ya hay{" "}
        {noun} emitidos para ese alcance, el sistema lo bloquea.
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
