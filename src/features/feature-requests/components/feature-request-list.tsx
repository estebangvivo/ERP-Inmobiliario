"use client";

import Link from "next/link";
import { Lightbulb } from "lucide-react";
import type { FeatureRequestStatus } from "@prisma/client";
import { FEATURE_REQUEST_STATUS_LABEL } from "@/features/feature-requests/lib/labels";
import { CreateFeatureRequestButton } from "@/features/feature-requests/components/create-feature-request-button";
import { cn } from "@/lib/utils";
import { formatDateTimeAR } from "@/lib/format-date";

export type FeatureRequestListItem = {
  id: string;
  title: string;
  status: FeatureRequestStatus;
  quoteAmount: number | null;
  quoteCurrency: string | null;
  messageCount: number;
  attachmentCount?: number;
  createdAt: string;
  updatedAt: string;
  organizationName?: string;
  createdByName?: string;
};

function statusClass(status: FeatureRequestStatus) {
  switch (status) {
    case "APPROVED":
    case "IMPLEMENTED":
      return "text-emerald-700 dark:text-emerald-400";
    case "QUOTED":
    case "AWAITING_USER":
      return "text-amber-700 dark:text-amber-400";
    case "REJECTED":
    case "CLOSED":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

export function FeatureRequestList({
  items,
  hrefBase = "/solicitudes",
  showOrg = false,
  showEmptyCreate = false,
}: {
  items: FeatureRequestListItem[];
  hrefBase?: string;
  showOrg?: boolean;
  /** Muestra CTA de alta cuando no hay solicitudes. */
  showEmptyCreate?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Lightbulb className="size-5" aria-hidden />
        </div>
        <p className="font-medium">Todavía no hay solicitudes</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Pedí un cambio o mejora al sistema. Vas a poder seguir la respuesta,
          cotización o consultas desde acá.
        </p>
        {showEmptyCreate && (
          <div className="mt-5">
            <CreateFeatureRequestButton label="Crear la primera" />
          </div>
        )}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`${hrefBase}/${item.id}`}
            className="block px-4 py-3.5 transition-colors hover:bg-surface/60"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.title}</p>
                {showOrg && (
                  <p className="text-xs text-muted-foreground">
                    {item.organizationName}
                    {item.createdByName ? ` · ${item.createdByName}` : ""}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Actualizada {formatDateTimeAR(item.updatedAt)} ·{" "}
                  {item.messageCount} mensaje
                  {item.messageCount === 1 ? "" : "s"}
                  {(item.attachmentCount ?? 0) > 0
                    ? ` · ${item.attachmentCount} adjunto${item.attachmentCount === 1 ? "" : "s"}`
                    : ""}
                  {item.quoteAmount != null && item.quoteCurrency
                    ? ` · ${item.quoteCurrency} ${item.quoteAmount.toLocaleString("es-AR")}`
                    : ""}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium",
                  statusClass(item.status),
                )}
              >
                {FEATURE_REQUEST_STATUS_LABEL[item.status]}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
