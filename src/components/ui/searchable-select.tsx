"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export type SearchableOption = {
  value: string;
  label: string;
  /** Texto extra para filtrar (CUIT, código, etc.). */
  keywords?: string;
};

type SearchableSelectProps = {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  /** Opción vacía al inicio (value ""). */
  emptyLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Para formularios nativos (input hidden). */
  name?: string;
  id?: string;
  className?: string;
  /** Acción al pie del desplegable (ej. crear cliente/proveedor). */
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;
};

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function SearchableSelect({
  options,
  value,
  onChange,
  emptyLabel,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  disabled = false,
  required = false,
  name,
  id,
  className = "",
  onCreateNew,
  createNewLabel,
}: SearchableSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => {
    if (!value) return null;
    return options.find((o) => o.value === value) ?? null;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => {
      const haystack = normalize(`${o.label} ${o.keywords ?? ""} ${o.value}`);
      return haystack.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  const displayLabel = selected?.label ?? (value ? value : emptyLabel || placeholder);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setQuery("");
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-left text-sm text-foreground outline-none ring-accent focus:ring-2 disabled:opacity-50"
      >
        <span className={selected || (!value && emptyLabel) ? "truncate" : "truncate text-muted-foreground"}>
          {displayLabel}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface-elevated shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              aria-label={searchPlaceholder}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          <ul
            id={listId}
            role="listbox"
            className="max-h-56 overflow-y-auto py-1"
          >
            {emptyLabel != null && (
              <li role="option" aria-selected={!value}>
                <button
                  type="button"
                  onClick={() => pick("")}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                    !value ? "bg-muted font-medium" : "text-muted-foreground"
                  }`}
                >
                  {emptyLabel}
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Sin resultados
              </li>
            ) : (
              filtered.map((opt) => {
                const active = opt.value === value;
                return (
                  <li key={opt.value} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => pick(opt.value)}
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                        active ? "bg-muted font-medium" : "text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  </li>
                );
              })
            )}
            {onCreateNew ? (
              <li className="border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                    onCreateNew(query.trim());
                  }}
                  className="block w-full px-3 py-2.5 text-left text-sm font-medium text-accent hover:bg-muted"
                >
                  {createNewLabel ??
                    (query.trim()
                      ? `Crear “${query.trim()}”…`
                      : "Crear nuevo…")}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      )}
    </div>
  );
}
