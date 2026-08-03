"use client";

import { useState } from "react";
import Link from "next/link";
import type { FeatureRequestStatus } from "@prisma/client";
import type { FeatureRequestListItem } from "@/features/feature-requests/components/feature-request-list";
import {
  FEATURE_REQUEST_STATUS_LABEL,
  FEATURE_REQUEST_ACTIVE_STATUSES,
  isFeatureRequestActive,
} from "@/features/feature-requests/lib/labels";
import { cn } from "@/lib/utils";
import { formatDateTimeAR } from "@/lib/format-date";

type AdminItem = FeatureRequestListItem & {
  organizationName: string;
  createdByName: string;
  createdByEmail: string;
};

const FILTERS: Array<{ id: "all" | "open" | "quoted" | "done"; label: string }> =
  [
    { id: "all", label: "Todas" },
    { id: "open", label: "Activas" },
    { id: "quoted", label: "Cotizadas" },
    { id: "done", label: "Cerradas" },
  ];

function matchesFilter(
  status: FeatureRequestStatus,
  filter: (typeof FILTERS)[number]["id"],
) {
  if (filter === "all") return true;
  if (filter === "quoted") return status === "QUOTED";
  if (filter === "done") {
    return ["APPROVED", "REJECTED", "IMPLEMENTED", "CLOSED"].includes(status);
  }
  return FEATURE_REQUEST_ACTIVE_STATUSES.includes(status);
}

export function AdminFeatureRequestsPanel({
  requests,
}: {
  requests: AdminItem[];
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const filtered = requests.filter((r) => matchesFilter(r.status, filter));
  const activeCount = requests.filter((r) =>
    isFeatureRequestActive(r.status),
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl tracking-tight">
          Solicitudes de mejora
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Revisá pedidos de usuarios, cotizá, consultá o aprobá la
          implementación. Abrí cada solicitud para el detalle y el hilo.
          {activeCount > 0
            ? ` · ${activeCount} activa${activeCount === 1 ? "" : "s"}`
            : requests.length > 0
              ? " · sin activas"
              : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              filter === f.id
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted-foreground hover:bg-surface",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay solicitudes de mejora en la plataforma.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay solicitudes en este filtro. Probá “Todas”.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {filtered.map((item) => (
            <li key={item.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.organizationName} · {item.createdByName} (
                    {item.createdByEmail})
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Actualizada {formatDateTimeAR(item.updatedAt)} ·{" "}
                    {item.messageCount} mensajes
                    {item.quoteAmount != null && item.quoteCurrency
                      ? ` · ${item.quoteCurrency} ${item.quoteAmount.toLocaleString("es-AR")}`
                      : ""}
                  </p>
                </div>
                <span className="text-sm font-medium">
                  {FEATURE_REQUEST_STATUS_LABEL[item.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
