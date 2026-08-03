import type { FeatureRequestStatus } from "@prisma/client";

export const FEATURE_REQUEST_STATUS_LABEL: Record<
  FeatureRequestStatus,
  string
> = {
  OPEN: "Abierta",
  IN_REVIEW: "En revisión",
  AWAITING_USER: "Consulta pendiente",
  QUOTED: "Cotizada",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  IMPLEMENTED: "Implementada",
  CLOSED: "Cerrada",
};

export const FEATURE_REQUEST_STATUS_OPTIONS: FeatureRequestStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "AWAITING_USER",
  "QUOTED",
  "APPROVED",
  "REJECTED",
  "IMPLEMENTED",
  "CLOSED",
];

/** Pendientes / en curso (no cerradas ni rechazadas). */
export const FEATURE_REQUEST_ACTIVE_STATUSES: FeatureRequestStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "AWAITING_USER",
  "QUOTED",
];

export function isFeatureRequestActive(
  status: FeatureRequestStatus,
): boolean {
  return FEATURE_REQUEST_ACTIVE_STATUSES.includes(status);
}