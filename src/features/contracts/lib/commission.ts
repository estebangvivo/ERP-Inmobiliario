export const COMMISSION_MODES = [
  "PERCENT_RENT",
  "FIXED_AMOUNT",
  "CONTRACT_TOTAL",
] as const;

export type CommissionModeValue = (typeof COMMISSION_MODES)[number];

export type CommissionContractInput = {
  commissionMode: CommissionModeValue | string;
  commissionValue: number | { toString(): string };
  commissionTenantPct: number | { toString(): string };
  commissionOwnerPct: number | { toString(): string };
  /** fallback legacy */
  agencyCommissionPct?: number | { toString(): string };
  initialRent: number | { toString(): string };
  startDate: Date;
  endDate: Date;
};

function n(v: number | { toString(): string } | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

/** Meses calendario del contrato (mínimo 1). */
export function contractPeriodMonths(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  const months =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth());
  return Math.max(1, months);
}

export function resolveCommissionMode(
  contract: CommissionContractInput,
): CommissionModeValue {
  const mode = contract.commissionMode as CommissionModeValue;
  if (
    mode === "PERCENT_RENT" ||
    mode === "FIXED_AMOUNT" ||
    mode === "CONTRACT_TOTAL"
  ) {
    return mode;
  }
  return "PERCENT_RENT";
}

export function resolveCommissionValue(contract: CommissionContractInput): number {
  const value = n(contract.commissionValue);
  if (value > 0) return value;
  // contratos viejos solo con agencyCommissionPct
  return n(contract.agencyCommissionPct);
}

export function resolvePayerSplit(contract: CommissionContractInput): {
  tenantPct: number;
  ownerPct: number;
} {
  let tenantPct = n(contract.commissionTenantPct);
  let ownerPct = n(contract.commissionOwnerPct);
  if (tenantPct === 0 && ownerPct === 0) {
    ownerPct = 100;
  }
  const sum = tenantPct + ownerPct;
  if (sum <= 0) return { tenantPct: 0, ownerPct: 100 };
  if (Math.abs(sum - 100) > 0.01) {
    tenantPct = round2((tenantPct / sum) * 100);
    ownerPct = round2(100 - tenantPct);
  }
  return { tenantPct, ownerPct };
}

/**
 * Comisión total del período (antes de repartir inquilino/propietario).
 * `periodRent` = alquiler del período (cuota).
 */
export function computePeriodCommissionTotal(
  contract: CommissionContractInput,
  periodRent: number,
): { total: number; label: string } {
  const mode = resolveCommissionMode(contract);
  const value = resolveCommissionValue(contract);

  if (value <= 0 || periodRent < 0) {
    return { total: 0, label: "Comisión inmobiliaria" };
  }

  if (mode === "PERCENT_RENT") {
    return {
      total: round2(periodRent * (value / 100)),
      label: `Comisión inmobiliaria ${value}%`,
    };
  }

  if (mode === "FIXED_AMOUNT") {
    return {
      total: round2(value),
      label: `Comisión inmobiliaria (monto fijo)`,
    };
  }

  // CONTRACT_TOTAL: prorrateo mensual del monto total del contrato
  const months = contractPeriodMonths(contract.startDate, contract.endDate);
  return {
    total: round2(value / months),
    label: `Comisión inmobiliaria (total contrato / ${months} meses)`,
  };
}

export function splitCommissionAmount(
  total: number,
  contract: CommissionContractInput,
): { tenant: number; owner: number } {
  const { tenantPct, ownerPct } = resolvePayerSplit(contract);
  const tenant = round2(total * (tenantPct / 100));
  const owner = round2(total - tenant);
  // si por redondeo queda desbalance, ajustar owner
  void ownerPct;
  return { tenant, owner };
}

export const COMMISSION_MODE_LABELS: Record<CommissionModeValue, string> = {
  PERCENT_RENT: "Porcentaje del alquiler",
  FIXED_AMOUNT: "Monto fijo por período",
  CONTRACT_TOTAL: "Monto sobre el total del contrato",
};
