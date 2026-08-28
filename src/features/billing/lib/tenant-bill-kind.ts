import type { TenantBillKind } from "@prisma/client";

export const TENANT_BILL_KIND_LABELS: Record<TenantBillKind, string> = {
  RENT: "Alquiler",
  SERVICES: "Servicios",
};

export function tenantBillPeriodKey(input: {
  contractId: string;
  periodYear: number;
  periodMonth: number;
  kind?: TenantBillKind;
}) {
  return {
    contractId_periodYear_periodMonth_kind: {
      contractId: input.contractId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      kind: input.kind ?? "RENT",
    },
  };
}

export function serviceBillReceiptPrefix() {
  return "SRV";
}

export function rentBillReceiptPrefix() {
  return "REC";
}
