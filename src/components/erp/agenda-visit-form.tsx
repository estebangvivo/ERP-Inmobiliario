"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  bookPropertyVisitAction,
  getAvailableVisitDays,
  type AvailableDay,
  type VisitActionResult,
  type VisitBookableProperty,
} from "@/server/actions/visit-bookings";

const initial: VisitActionResult | null = null;

export function AgendaVisitForm({
  properties,
  defaultDateKey,
  onCancel,
  onBookedAnother,
}: {
  properties: VisitBookableProperty[];
  defaultDateKey?: string;
  onCancel?: () => void;
  onBookedAnother?: () => void;
}) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [days, setDays] = useState<AvailableDay[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [dateKey, setDateKey] = useState(defaultDateKey ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingLoad, startLoad] = useTransition();
  const [state, formAction, pending] = useActionState(
    bookPropertyVisitAction,
    initial,
  );

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  function refreshSlots(nextPropertyId: string, preferDateKey?: string) {
    if (!nextPropertyId) {
      setDays([]);
      setDateKey("");
      setStartsAt("");
      return;
    }
    startLoad(async () => {
      setLoadingSlots(true);
      setLoadError(null);
      try {
        const next = await getAvailableVisitDays(nextPropertyId);
        setDays(next);
        if (next.length === 0) {
          setDateKey("");
          setStartsAt("");
          return;
        }
        const preferred =
          preferDateKey && next.some((d) => d.dateKey === preferDateKey)
            ? preferDateKey
            : dateKey && next.some((d) => d.dateKey === dateKey)
              ? dateKey
              : next[0]!.dateKey;
        setDateKey(preferred);
      } catch {
        setLoadError("No se pudieron cargar los turnos.");
        setDays([]);
        setDateKey("");
        setStartsAt("");
      } finally {
        setLoadingSlots(false);
      }
    });
  }

  useEffect(() => {
    if (propertyId) {
      refreshSlots(propertyId, defaultDateKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (defaultDateKey && propertyId) {
      refreshSlots(propertyId, defaultDateKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDateKey]);

  const selectedDay = useMemo(
    () => days.find((d) => d.dateKey === dateKey) ?? null,
    [days, dateKey],
  );

  useEffect(() => {
    if (!selectedDay) {
      setStartsAt("");
      return;
    }
    if (!selectedDay.slots.some((s) => s.startsAt === startsAt)) {
      setStartsAt(selectedDay.slots[0]?.startsAt ?? "");
    }
  }, [selectedDay, startsAt]);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  if (properties.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted-foreground)]">
        No hay propiedades publicadas en el portal. Publicá una propiedad para
        agendar visitas con los mismos criterios que la web.
      </p>
    );
  }

  if (state?.ok) {
    return (
      <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Visita agendada</p>
        <p>{state.message}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onBookedAnother?.();
            }}
          >
            Agendar otra
          </Button>
          {onCancel ? (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              Cerrar
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="startsAt" value={startsAt} />

      <div>
        <h3 className="font-semibold">Nueva visita</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Mismos turnos y reglas que el portal: propiedad publicada, horario de
          agenda y slots de 1 hora.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="agenda-visit-property">Propiedad</Label>
        <Select
          id="agenda-visit-property"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
      </div>

      {loadingSlots || pendingLoad ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Cargando turnos disponibles…
        </p>
      ) : loadError ? (
        <p className="text-sm text-[var(--destructive)]">{loadError}</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {selectedProperty
            ? `No hay turnos libres para “${selectedProperty.title}” en los próximos días.`
            : "Elegí una propiedad."}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="agenda-visit-date">Fecha</Label>
            <Select
              id="agenda-visit-date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
            >
              {days.map((d) => (
                <option key={d.dateKey} value={d.dateKey}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Horario</Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(selectedDay?.slots ?? []).map((slot) => {
                const active = slot.startsAt === startsAt;
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => setStartsAt(slot.startsAt)}
                    className={`rounded-md border px-2 py-2 text-sm transition ${
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--ring)]"
                    }`}
                  >
                    {slot.timeLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="agenda-visit-name">Nombre</Label>
          <Input id="agenda-visit-name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agenda-visit-email">Email</Label>
          <Input id="agenda-visit-email" name="email" type="email" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="agenda-visit-phone">Teléfono</Label>
        <Input id="agenda-visit-phone" name="phone" />
      </div>

      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || !startsAt || days.length === 0}
        >
          {pending ? "Guardando…" : "Agendar visita"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
