"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";
import {
  createPartyPersonAction,
  type PartyPersonKind,
} from "@/server/actions/party-people";

export type PartyPersonOption = {
  id: string;
  name: string;
  documentNumber?: string | null;
  email?: string | null;
};

const KIND_LABEL: Record<PartyPersonKind, string> = {
  OWNER: "propietario",
  TENANT: "inquilino",
  GUARANTOR: "garante",
};

type Props = {
  kind: PartyPersonKind;
  name: string;
  id?: string;
  value: string;
  onChange: (value: string, person?: PartyPersonOption) => void;
  options: PartyPersonOption[];
  required?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  /** Muestra enlace al ABM de usuarios (alta completa). */
  showAbmLink?: boolean;
};

export function PartyPersonSearchSelect({
  kind,
  name,
  id,
  value,
  onChange,
  options: initialOptions,
  required = false,
  emptyLabel,
  disabled,
  showAbmLink = true,
}: Props) {
  const [extra, setExtra] = useState<PartyPersonOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const kindLabel = KIND_LABEL[kind];

  const options = useMemo(() => {
    const map = new Map<string, PartyPersonOption>();
    for (const o of initialOptions) map.set(o.id, o);
    for (const o of extra) map.set(o.id, o);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [initialOptions, extra]);

  const searchable: SearchableOption[] = options.map((o) => ({
    value: o.id,
    label: o.documentNumber ? `${o.name} · DNI ${o.documentNumber}` : o.name,
    keywords: [o.documentNumber, o.email].filter(Boolean).join(" ") || undefined,
  }));

  const abmHref = `/usuarios?alta=1&role=${kind}`;

  function openCreate(query: string) {
    setDraftName(query);
    setDni("");
    setPhone("");
    setError(null);
    setCreating(true);
  }

  function submitCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createPartyPersonAction({
        kind,
        name: draftName,
        dni,
        phone: phone || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const person: PartyPersonOption = {
        id: result.person.id,
        name: result.person.name,
        documentNumber: result.person.documentNumber,
      };
      setExtra((prev) => [...prev, person]);
      onChange(person.id, person);
      setCreating(false);
    });
  }

  return (
    <div className="space-y-2">
      <SearchableSelect
        id={id}
        name={name}
        value={value}
        onChange={(v) => {
          const person = options.find((o) => o.id === v);
          onChange(v, person);
        }}
        options={searchable}
        required={required}
        disabled={disabled || creating}
        emptyLabel={emptyLabel}
        placeholder={`Buscar ${kindLabel}…`}
        searchPlaceholder="Nombre, DNI o email…"
        onCreateNew={openCreate}
        createNewLabel={`Agregar ${kindLabel} nuevo…`}
      />

      {showAbmLink ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          <Link
            href={abmHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--primary)] hover:underline"
          >
            Alta completa en Usuarios
          </Link>
          {" · "}
          Si no está en la lista, podés crearlo acá o desde el ABM.
        </p>
      ) : null}

      {creating ? (
        <div className="space-y-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-3">
          <p className="text-sm font-medium">Nuevo {kindLabel}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`${name}-new-name`}>Nombre</Label>
              <Input
                id={`${name}-new-name`}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${name}-new-dni`}>DNI</Label>
              <Input
                id={`${name}-new-dni`}
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                inputMode="numeric"
                placeholder="Sin puntos"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${name}-new-phone`}>Teléfono (opcional)</Label>
              <Input
                id={`${name}-new-phone`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            El sistema verifica que el DNI no exista ya como propietario,
            inquilino o garante.
          </p>
          {error ? (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={submitCreate}
            >
              {pending ? "Guardando…" : `Crear ${kindLabel}`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setCreating(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
