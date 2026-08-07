import type { TreasuryPaymentMethod } from "@prisma/client";
import {
  createReceipt,
  createPaymentOrder,
  type ActionResult as TreasuryActionResult,
} from "@/features/treasury/actions/treasury-actions";
import { toDateInputValue } from "@/lib/format-date";

export function toTreasuryPaymentMethod(
  method: string,
): TreasuryPaymentMethod {
  switch (method) {
    case "CASH":
      return "CASH";
    case "BANK_TRANSFER":
      return "TRANSFER";
    // Cheque/tarjeta requieren datos extra en el formulario de tesorería;
    // desde cobros/gastos rápidos se registra como "Otro".
    default:
      return "OTHER";
  }
}

export type BillingReceiptAllocation = {
  billId: string;
  contractId: string;
  amount: number;
  description: string;
};

/** Emite recibo de tesorería (y lo imputa) a partir de cobros de cuotas. */
export async function issueReceiptForBillPayments(input: {
  tenantId?: string;
  partyName?: string;
  currency: string;
  method: string;
  bankAccountId?: string;
  reference?: string;
  notes?: string;
  allocations: BillingReceiptAllocation[];
}): Promise<TreasuryActionResult> {
  const allocations = input.allocations.filter((a) => a.amount > 0.009);
  if (allocations.length === 0) {
    return { ok: false, error: "No hay montos para el recibo." };
  }

  const total = allocations.reduce((s, a) => s + a.amount, 0);
  const treasuryMethod = toTreasuryPaymentMethod(input.method);

  return createReceipt({
    issueDate: toDateInputValue(new Date()),
    tenantId: input.tenantId,
    partyName: input.partyName,
    currency: input.currency,
    concept: "Cobro de cuotas",
    notes: [input.notes?.trim(), input.reference ? `Ref. ${input.reference}` : null]
      .filter(Boolean)
      .join(" · ") || undefined,
    lines: allocations.map((a) => ({
      contractId: a.contractId,
      description: a.description,
      amount: a.amount,
    })),
    billApps: allocations.map((a) => ({
      documentId: a.billId,
      amount: a.amount,
    })),
    payments: [
      {
        method: treasuryMethod,
        amount: Math.round(total * 100) / 100,
        bankAccountId:
          treasuryMethod === "TRANSFER" ? input.bankAccountId : undefined,
      },
    ],
  });
}

/** Emite OP de tesorería por una rendición. */
export async function issuePaymentOrderForSettlement(input: {
  settlementId: string;
  ownerId: string;
  ownerName: string;
  contractId: string;
  amount: number;
  currency: string;
  method?: string;
  bankAccountId?: string;
  transferRef?: string;
  description: string;
}): Promise<TreasuryActionResult> {
  const treasuryMethod = toTreasuryPaymentMethod(
    input.method ?? (input.bankAccountId ? "BANK_TRANSFER" : "CASH"),
  );

  return createPaymentOrder({
    issueDate: toDateInputValue(new Date()),
    partyName: input.ownerName,
    currency: input.currency,
    concept: "Pago de rendición",
    notes: input.transferRef ? `Ref. ${input.transferRef}` : undefined,
    lines: [
      {
        contractId: input.contractId,
        description: input.description,
        amount: input.amount,
      },
    ],
    settlementApps: [
      { documentId: input.settlementId, amount: input.amount },
    ],
    payments: [
      {
        method: treasuryMethod,
        amount: input.amount,
        bankAccountId:
          treasuryMethod === "TRANSFER" ? input.bankAccountId : undefined,
      },
    ],
  });
}

/** Emite OP de tesorería por factura de proveedor. */
export async function issuePaymentOrderForSupplierInvoice(input: {
  invoiceId: string;
  supplierId: string;
  supplierName: string;
  contractId: string;
  amount: number;
  currency: string;
  method?: string;
  bankAccountId?: string;
  reference?: string;
  description: string;
}): Promise<TreasuryActionResult> {
  const treasuryMethod = toTreasuryPaymentMethod(
    input.method ?? (input.bankAccountId ? "BANK_TRANSFER" : "CASH"),
  );

  return createPaymentOrder({
    issueDate: toDateInputValue(new Date()),
    supplierId: input.supplierId,
    partyName: input.supplierName,
    currency: input.currency,
    concept: "Pago a proveedor",
    notes: input.reference ? `Ref. ${input.reference}` : undefined,
    lines: [
      {
        contractId: input.contractId,
        description: input.description,
        amount: input.amount,
      },
    ],
    invoiceApps: [{ documentId: input.invoiceId, amount: input.amount }],
    payments: [
      {
        method: treasuryMethod,
        amount: input.amount,
        bankAccountId:
          treasuryMethod === "TRANSFER" ? input.bankAccountId : undefined,
      },
    ],
  });
}
