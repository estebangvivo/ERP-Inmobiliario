"use client";

import { useMemo, useState, useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUnitAction } from "@/server/actions/complexes";
import type { ActionResult } from "@/server/actions/users";
import { PROPERTY_TYPE_LABELS } from "@/server/validators/property";
import type { PropertyType } from "@prisma/client";

const initial: ActionResult | null = null;

export type LinkablePropertyOption = {
  id: string;
  title: string;
  address: string;
  city: string;
  propertyType: PropertyType;
  areaM2: string | null;
  rooms: number | null;
};

export function UnitForm({
  complexId,
  properties,
}: {
  complexId: string;
  properties: LinkablePropertyOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [state, formAction, pending] = useActionState(createUnitAction, initial);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? properties.filter((p) => {
          const hay = `${p.title} ${p.address} ${p.city} ${PROPERTY_TYPE_LABELS[p.propertyType]}`.toLowerCase();
          return hay.includes(q);
        })
      : properties;
    return base.slice(0, q ? base.length : 80);
  }, [properties, query]);

  const selected = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  useEffect(() => {
    if (state?.ok) {
      setQuery("");
      setPropertyId("");
      router.refresh();
    }
  }, [state, router]);

  if (properties.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted-foreground)]">
        No hay propiedades disponibles. Creá inmuebles en{" "}
        <Link href="/gestion/propiedades/nueva" className="text-[var(--primary)] underline">
          Propiedades
        </Link>{" "}
        que aún no estén vinculadas a un edificio (departamento, local, oficina u otro).
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <input type="hidden" name="complexId" value={complexId} />
      <input type="hidden" name="propertyId" value={propertyId} />

      <div>
        <p className="text-sm font-medium">Agregar unidad desde Propiedades</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Elegí un departamento ya cargado. Se vincula automáticamente y toma m² y
          ambientes de la ficha.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="property-search">Buscar propiedad</Label>
        <Input
          id="property-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Título, dirección o ciudad"
        />
        {properties.length > 50 && !query.trim() ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Hay {properties.length} propiedades sin edificio. Escribí en la búsqueda
            (ej. calle o barrio) para encontrar la que necesitás.
          </p>
        ) : null}
      </div>

      <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
        {filtered.length === 0 ? (
          <p className="p-2 text-sm text-[var(--muted-foreground)]">
            Ninguna propiedad coincide con la búsqueda.
          </p>
        ) : (
          filtered.map((p) => {
            const active = p.id === propertyId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPropertyId(p.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                  active
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "hover:bg-[var(--muted)]"
                }`}
              >
                <span className="font-medium">{p.title}</span>
                <span className={active ? "opacity-90" : "text-[var(--muted-foreground)]"}>
                  {" "}
                  · {p.address}, {p.city} · {PROPERTY_TYPE_LABELS[p.propertyType]}
                  {p.areaM2 ? ` · ${p.areaM2} m²` : ""}
                  {p.rooms != null ? ` · ${p.rooms} amb.` : ""}
                </span>
              </button>
            );
          })
        )}
      </div>

      {selected ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Seleccionado: <strong>{selected.title}</strong>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[minmax(8rem,12rem)_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="ownershipCoefficient">Coeficiente de expensas</Label>
          <Input
            id="ownershipCoefficient"
            name="ownershipCoefficient"
            type="number"
            step="0.000001"
            min="0.000001"
            max="1"
            placeholder="0.25"
            required
          />
        </div>
        <Button type="submit" disabled={pending || !propertyId}>
          {pending ? "Vinculando…" : "Agregar unidad"}
        </Button>
      </div>

      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}
    </form>
  );
}
