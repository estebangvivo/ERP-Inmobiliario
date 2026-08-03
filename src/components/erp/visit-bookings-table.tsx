"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  updateVisitBookingStatusAction,
  type VisitBookingRow,
} from "@/server/actions/visit-bookings";
import { formatArtDisplay } from "@/lib/visit-slots";

const STATUS_LABEL: Record<VisitBookingRow["status"], string> = {
  RESERVED: "Reservada",
  CANCELLED: "Cancelada",
  COMPLETED: "Completada",
};

export function VisitBookingsTable({
  bookings,
}: {
  bookings: VisitBookingRow[];
}) {
  const [pending, startTransition] = useTransition();

  function setStatus(id: string, status: VisitBookingRow["status"]) {
    startTransition(async () => {
      await updateVisitBookingStatusAction(id, status);
      window.location.reload();
    });
  }

  if (bookings.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center text-sm text-[var(--muted-foreground)]">
        Todavía no hay visitas agendadas desde el portal.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="min-w-full text-sm">
        <thead className="bg-[var(--muted)]/40 text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          <tr>
            <th className="px-4 py-3">Fecha y hora</th>
            <th className="px-4 py-3">Propiedad</th>
            <th className="px-4 py-3">Contacto</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {bookings.map((b) => (
            <tr key={b.id} className="hover:bg-[var(--muted)]/30">
              <td className="px-4 py-3 font-medium capitalize">
                {formatArtDisplay(new Date(b.startsAt))}
              </td>
              <td className="px-4 py-3">{b.property.title}</td>
              <td className="px-4 py-3">
                <p className="font-medium">{b.name}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {b.email}
                  {b.phone ? ` · ${b.phone}` : ""}
                </p>
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    b.status === "RESERVED"
                      ? "warning"
                      : b.status === "COMPLETED"
                        ? "success"
                        : "secondary"
                  }
                >
                  {STATUS_LABEL[b.status]}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  {b.status === "RESERVED" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setStatus(b.id, "COMPLETED")}
                      >
                        Completar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setStatus(b.id, "CANCELLED")}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
