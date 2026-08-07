import type {
  CashMovementType,
  CashRegisterType,
  CashSessionStatus,
} from "@prisma/client";
import { normalizeCurrency } from "@/config/currencies";

export const CASH_REGISTER_LABEL: Record<CashRegisterType, string> = {
  DAILY: "Caja diaria",
  TREASURY: "Caja tesorería",
};

export const CASH_SESSION_STATUS_LABEL: Record<CashSessionStatus, string> = {
  OPEN: "Abierta",
  CLOSED: "Cerrada",
  CANCELLED: "Anulada",
};

export const CASH_SESSION_STATUS_STYLE: Record<CashSessionStatus, string> = {
  OPEN: "bg-accent/15 text-accent",
  CLOSED: "bg-success/15 text-success",
  CANCELLED: "bg-danger/15 text-danger",
};

export const CASH_MOVEMENT_LABEL: Record<CashMovementType, string> = {
  OPENING: "Apertura",
  INCOME: "Ingreso",
  EXPENSE: "Egreso",
  ADJUSTMENT: "Ajuste",
  CLOSE_TRANSFER: "Cierre → tesorería",
  TREASURY_IN: "Cierre de caja diaria",
  TREASURY_DEPOSIT: "Depósito",
  TREASURY_WITHDRAWAL: "Extracción",
  BANK_DEPOSIT: "Depósito a banco",
  BANK_WITHDRAWAL: "Extracción de banco",
};

export function formatCashMoney(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: normalizeCurrency(currency),
    maximumFractionDigits: 2,
  }).format(value);
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
