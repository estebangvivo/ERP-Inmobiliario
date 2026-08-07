"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { SearchableOption } from "@/components/ui/searchable-select";

type SearchableMultiSelectProps = {
  options: SearchableOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  emptyHint?: string;
};

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export function SearchableMultiSelect({
  options,
  values,
  onChange,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  disabled = false,
  className = "",
  emptyHint = "Sin resultados",
}: SearchableMultiSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Selección provisional mientras el menú está abierto. */
  const [draft, setDraft] = useState<string[]>(values);

  useEffect(() => {
    if (!open) setDraft(values);
  }, [values, open]);

  const draftSet = useMemo(() => new Set(draft), [draft]);

  const selectedOptions = useMemo(
    () => options.filter((o) => values.includes(o.value)),
    [options, values],
  );

  const draftOptions = useMemo(
    () => options.filter((o) => draftSet.has(o.value)),
    [options, draftSet],
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => {
      const haystack = normalize(`${o.label} ${o.keywords ?? ""} ${o.value}`);
      return haystack.includes(q);
    });
  }, [options, query]);

  function commitAndClose() {
    if (!sameIds(draft, values)) onChange(draft);
    setOpen(false);
    setQuery("");
  }

  function cancelAndClose() {
    setDraft(values);
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        commitAndClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelAndClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit usa draft/values actuales al cerrar
  }, [open, draft, values]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  function toggle(value: string) {
    setDraft((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  const visibleSelected = open ? draftOptions : selectedOptions;
  const summary =
    visibleSelected.length === 0
      ? placeholder
      : visibleSelected.length === 1
        ? visibleSelected[0].label
        : `${visibleSelected.length} partidas seleccionadas`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          if (open) {
            commitAndClose();
            return;
          }
          setDraft(values);
          setQuery("");
          setOpen(true);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-left text-sm text-foreground outline-none ring-accent focus:ring-2 disabled:opacity-50"
      >
        <span
          className={
            visibleSelected.length > 0
              ? "truncate"
              : "truncate text-muted-foreground"
          }
        >
          {summary}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      {!open && selectedOptions.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-xs"
            >
              <span className="truncate">{opt.label}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Quitar ${opt.label}`}
                onClick={() =>
                  onChange(values.filter((v) => v !== opt.value))
                }
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface-elevated shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
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
            aria-multiselectable
            className="max-h-56 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {emptyHint}
              </li>
            ) : (
              filtered.map((opt) => {
                const active = draftSet.has(opt.value);
                return (
                  <li key={opt.value} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => toggle(opt.value)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                        active ? "bg-muted font-medium" : "text-foreground"
                      }`}
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                          active
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border"
                        }`}
                      >
                        {active ? (
                          <Check className="size-3" aria-hidden />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {draft.length === 0
                ? "Ninguna seleccionada"
                : `${draft.length} seleccionada${draft.length === 1 ? "" : "s"}`}
            </p>
            <button
              type="button"
              onClick={commitAndClose}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground"
            >
              Listo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
