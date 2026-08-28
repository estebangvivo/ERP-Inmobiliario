import type { TreasuryPaymentMethod } from "@prisma/client";
import { PAYMENT_METHOD_LABEL, formatMoney } from "@/features/treasury/lib/labels";
import { normalizeCheckNumber } from "@/features/treasury/lib/check-number";
import { parseDateInput } from "@/lib/dates";

export type TreasuryPaymentInput = {
  method: TreasuryPaymentMethod;
  amount: number;
  bankAccountId?: string;
  checkInstrumentId?: string;
  isOwnCheck?: boolean;
  isElectronicCheck?: boolean;
  checkNumber?: string;
  checkBank?: string;
  checkIssueDate?: string;
  checkDueDate?: string;
  checkAccount?: string;
};

export function cashAmountFromPayments(
  payments: { method: TreasuryPaymentMethod; amount: number }[],
): number {
  return payments
    .filter((p) => p.method === "CASH")
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
}

export function formatPaymentMethodsShort(
  payments: { method: TreasuryPaymentMethod }[] | undefined,
  fallback: TreasuryPaymentMethod,
): string {
  const methods = [
    ...new Set(
      (payments && payments.length > 0
        ? payments.map((p) => p.method)
        : [fallback]
      ).filter(Boolean),
    ),
  ];
  return methods.map((m) => PAYMENT_METHOD_LABEL[m]).join(" + ");
}

export function formatPaymentMethodsDetailed(
  payments:
    | {
        method: TreasuryPaymentMethod;
        amount: number;
        bankAccountName?: string | null;
      }[]
    | undefined,
  fallback: TreasuryPaymentMethod,
  totalAmount: number,
  currency: string,
): string {
  if (!payments || payments.length === 0) {
    return `${PAYMENT_METHOD_LABEL[fallback]} ${formatMoney(totalAmount, currency)}`;
  }
  return payments
    .map((p) => {
      const bank =
        p.method === "TRANSFER" && p.bankAccountName
          ? ` (${p.bankAccountName})`
          : "";
      return `${PAYMENT_METHOD_LABEL[p.method]}${bank} ${formatMoney(Number(p.amount), currency)}`;
    })
    .join(" · ");
}

export function validatePaymentsAgainstTotal(
  payments: TreasuryPaymentInput[],
  totalAmount: number,
  opts?: { requirePortfolioChecks?: boolean },
): string | null {
  const cleaned = payments.filter((p) => Number(p.amount) > 0);
  if (cleaned.length === 0) {
    return "Agregá al menos un medio de pago con monto.";
  }
  for (const p of cleaned) {
    if (p.method === "TRANSFER" && !p.bankAccountId) {
      return "Elegí la cuenta bancaria en cada pago por transferencia.";
    }
    if (p.method === "CHECK") {
      if (opts?.requirePortfolioChecks) {
        if (p.isOwnCheck) {
          if (!p.checkNumber?.trim() || !p.checkBank?.trim()) {
            return "Completá número y banco del cheque propio.";
          }
          if (p.isElectronicCheck === undefined) {
            return "Indicá si el cheque propio es electrónico o físico.";
          }
          if (!p.bankAccountId) {
            return "Elegí la cuenta emisora del cheque propio.";
          }
          if (!p.checkDueDate) {
            return "Indicá el vencimiento del cheque propio.";
          }
        } else if (!p.checkInstrumentId) {
          return "Elegí un cheque de la cartera o marcá emisión de cheque propio.";
        }
      } else if (!p.checkNumber?.trim() || !p.checkBank?.trim()) {
        return "Completá número y banco en cada pago con cheque.";
      } else if (p.isElectronicCheck === undefined) {
        return "Indicá si el cheque es electrónico o físico.";
      }
    }
  }
  const sum = cleaned.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  if (Math.abs(sum - totalAmount) > 0.009) {
    return `La suma de medios de pago (${sum.toFixed(2)}) debe coincidir con el total del documento (${totalAmount.toFixed(2)}).`;
  }
  return null;
}

export function primaryPaymentMethod(
  payments: { method: TreasuryPaymentMethod }[],
  fallback: TreasuryPaymentMethod = "CASH",
): TreasuryPaymentMethod {
  return payments[0]?.method ?? fallback;
}

export function paymentCreateData(
  payments: TreasuryPaymentInput[],
  opts?: { forPaymentOrder?: boolean },
) {
  return payments
    .filter((p) => Number(p.amount) > 0)
    .map((p, index) => {
      const bankAccountId =
        p.method === "TRANSFER" ? p.bankAccountId || null : null;

      if (p.method === "CHECK") {
        const isElectronic = Boolean(p.isElectronicCheck);
        const checkNumber =
          normalizeCheckNumber(p.checkNumber, isElectronic) || null;

        if (opts?.forPaymentOrder) {
          const isOwn = Boolean(p.isOwnCheck);
          return {
            method: p.method,
            amount: Number(p.amount),
            sortOrder: index,
            bankAccountId: isOwn ? p.bankAccountId || null : null,
            checkInstrumentId: isOwn ? null : p.checkInstrumentId || null,
            isOwnCheck: isOwn,
            isElectronicCheck: isElectronic,
            checkNumber: isOwn ? checkNumber : p.checkNumber?.trim() || null,
            checkBank: p.checkBank?.trim() || null,
            checkIssueDate: p.checkIssueDate
              ? parseDateInput(p.checkIssueDate)
              : null,
            checkDueDate: p.checkDueDate ? parseDateInput(p.checkDueDate) : null,
            checkAccount: p.checkAccount?.trim() || null,
          };
        }
        return {
          method: p.method,
          amount: Number(p.amount),
          sortOrder: index,
          bankAccountId,
          isElectronicCheck: isElectronic,
          checkNumber,
          checkBank: p.checkBank?.trim() || null,
          checkIssueDate: p.checkIssueDate
            ? parseDateInput(p.checkIssueDate)
            : null,
          checkDueDate: p.checkDueDate ? parseDateInput(p.checkDueDate) : null,
          checkAccount: p.checkAccount?.trim() || null,
        };
      }

      if (opts?.forPaymentOrder) {
        return {
          method: p.method,
          amount: Number(p.amount),
          sortOrder: index,
          bankAccountId,
          checkInstrumentId: null as string | null,
          isOwnCheck: false,
          isElectronicCheck: false,
          checkNumber: null as string | null,
          checkBank: null as string | null,
          checkIssueDate: null as Date | null,
          checkDueDate: null as Date | null,
          checkAccount: null as string | null,
        };
      }

      return {
        method: p.method,
        amount: Number(p.amount),
        sortOrder: index,
        bankAccountId,
        isElectronicCheck: false,
        checkNumber: null as string | null,
        checkBank: null as string | null,
        checkIssueDate: null as Date | null,
        checkDueDate: null as Date | null,
        checkAccount: null as string | null,
      };
    });
}

/** Alias usado en consultas legacy. */
export const formatTreasuryPaymentMethodsShort = formatPaymentMethodsShort;
