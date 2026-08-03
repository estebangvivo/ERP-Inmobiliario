"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  bookPropertyVisitAction,
  getAvailableVisitDays,
  type AvailableDay,
  type VisitActionResult,
} from "@/server/actions/visit-bookings";

const initial: VisitActionResult | null = null;

export function VisitBookingForm({
  propertyId,
  propertyTitle,
}: {
  propertyId: string;
  propertyTitle: string;
}) {
  const [days, setDays] = useState<AvailableDay[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [dateKey, setDateKey] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingLoad, startLoad] = useTransition();
  const [state, formAction, pending] = useActionState(
    bookPropertyVisitAction,
    initial,
  );

  function refreshSlots() {
    startLoad(async () => {
      setLoadingSlots(true);
      setLoadError(null);
      try {
        const next = await getAvailableVisitDays(propertyId);
        setDays(next);
        if (next.length === 0) {
          setDateKey("");
          setStartsAt("");
        } else {
          const firstDay = next[0]!;
          setDateKey((prev) =>
            next.some((d) => d.dateKey === prev) ? prev : firstDay.dateKey,
          );
        }
      } catch {
        setLoadError("No se pudieron cargar los turnos.");
      } finally {
        setLoadingSlots(false);
      }
    });
  }

  useEffect(() => {
    refreshSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

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

  if (state?.ok) {
    return (
      <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
        <p className="font-semibold">¡Visita reservada!</p>
        <p>{state.message}</p>
        <p className="text-emerald-800/80">
          Te contactaremos si hace falta confirmar detalles del encuentro.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reservar otro turno
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="startsAt" value={startsAt} />

      <div>
        <h3 className="text-lg font-semibold">Agendar visita</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Sobre “{propertyTitle}”. Elegí un día y horario disponible (turnos de 1 hora).
        </p>
      </div>

      {loadingSlots || pendingLoad ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Cargando turnos disponibles…
        </p>
      ) : loadError ? (
        <p className="text-sm text-[var(--destructive)]">{loadError}</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No hay turnos libres en los próximos días.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="visit-date">Fecha</Label>
            <Select
              id="visit-date"
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

      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" />
      </div>

      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}

      <Button
        type="submit"
        disabled={pending || !startsAt || days.length === 0}
        className="w-full"
      >
        {pending ? "Reservando…" : "Reservar visita"}
      </Button>
    </form>
  );
}
