"use client";

import { useEffect, useState, useActionState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createUnitAction,
  searchLinkablePropertiesAction,
  type LinkablePropertyRow,
  type LinkedPropertyHint,
} from "@/server/actions/complexes";
import type { ActionResult } from "@/server/actions/users";
import { PROPERTY_TYPE_LABELS } from "@/server/validators/property";

const initial: ActionResult | null = null;

export type LinkablePropertyOption = LinkablePropertyRow;

export function UnitForm({ complexId }: { complexId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkablePropertyRow[]>([]);
  const [linkedHints, setLinkedHints] = useState<LinkedPropertyHint[]>([]);
  const [selected, setSelected] = useState<LinkablePropertyRow | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [state, formAction, pending] = useActionState(createUnitAction, initial);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLinkedHints([]);
      setSearchError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      startSearch(async () => {
        setSearchError(null);
        try {
          const data = await searchLinkablePropertiesAction(q);
          setResults(data.items);
          setLinkedHints(data.linkedHints);
          setSelected((prev) =>
            prev && data.items.some((p) => p.id === prev.id) ? prev : null,
          );
        } catch {
          setSearchError("No se pudo buscar propiedades.");
          setResults([]);
          setLinkedHints([]);
        }
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (state?.ok) {
      setQuery("");
      setResults([]);
      setLinkedHints([]);
      setSelected(null);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <input type="hidden" name="complexId" value={complexId} />
      <input type="hidden" name="propertyId" value={selected?.id ?? ""} />

      <div>
        <p className="text-sm font-medium">Agregar unidad desde Propiedades</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Buscá cualquier inmueble cargado (departamento, local, comercio, casa u
          otro) que aún no esté en un edificio. Se vincula automáticamente y toma
          m² y ambientes de la ficha.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="property-search">Buscar propiedad</Label>
        <Input
          id="property-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Título, dirección o ciudad (mín. 2 letras)"
          autoComplete="off"
        />
        {query.trim().length < 2 ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Escribí al menos 2 caracteres para buscar entre todas las propiedades
            disponibles.
          </p>
        ) : searching ? (
          <p className="text-xs text-[var(--muted-foreground)]">Buscando…</p>
        ) : null}
        {searchError ? (
          <p className="text-xs text-[var(--destructive)]">{searchError}</p>
        ) : null}
      </div>

      <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
        {query.trim().length < 2 ? (
          <p className="p-2 text-sm text-[var(--muted-foreground)]">
            La búsqueda consulta el servidor (no hay límite de tipos salvo
            terrenos).
          </p>
        ) : results.length === 0 && !searching ? (
          <p className="p-2 text-sm text-[var(--muted-foreground)]">
            Ninguna propiedad libre coincide con la búsqueda.
          </p>
        ) : (
          results.map((p) => {
            const active = p.id === selected?.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                  active
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "hover:bg-[var(--muted)]"
                }`}
              >
                <span className="font-medium">{p.title}</span>
                <span
                  className={
                    active ? "opacity-90" : "text-[var(--muted-foreground)]"
                  }
                >
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

      {linkedHints.length > 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs text-[var(--muted-foreground)]">
          <p className="font-medium text-[var(--foreground)]">
            Ya vinculadas a un edificio
          </p>
          <ul className="mt-1 space-y-0.5">
            {linkedHints.map((h) => (
              <li key={`${h.title}-${h.complexName}`}>
                {h.title} → <strong>{h.complexName}</strong>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Esas fichas no se pueden agregar de nuevo; aparecen en la tabla de
            unidades del edificio correspondiente.
          </p>
        </div>
      ) : null}

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
        <Button type="submit" disabled={pending || !selected}>
          {pending ? "Vinculando…" : "Agregar unidad"}
        </Button>
      </div>

      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}

      <p className="text-xs text-[var(--muted-foreground)]">
        ¿Falta el inmueble?{" "}
        <Link
          href="/gestion/propiedades/nueva"
          className="text-[var(--primary)] underline"
        >
          Crear en Propiedades
        </Link>
      </p>
    </form>
  );
}
