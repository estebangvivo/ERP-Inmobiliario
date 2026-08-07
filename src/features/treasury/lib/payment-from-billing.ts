import type { Prisma } from "@prisma/client";
import {
  NoOpenCashError,
  postCashMovementFromTreasuryDoc,
} from "@/features/treasury/lib/cash-from-treasury";
import { postBankMovement } from "@/features/treasury/lib/bank-from-treasury";

type Tx = Prisma.TransactionClient;

export { NoOpenCashError };

/**
 * Impacta caja o banco según el medio del cobro de cuota (sin recibo de tesorería).
 * - CASH → caja diaria abierta
 * - BANK_TRANSFER → cuenta bancaria (bankAccountId obligatorio)
 */
export async function applyPaymentTreasuryImpact(
  tx: Tx,
  input: {
    organizationId: string;
    currency: string;
    amount: number;
    method: string;
    bankAccountId?: string | null;
    description: string;
    createdById?: string | null;
  },
) {
  const amount = Number(input.amount) || 0;
  if (amount <= 0) return;

  if (input.method === "CASH") {
    await postCashMovementFromTreasuryDoc(tx, {
      organizationId: input.organizationId,
      currency: input.currency,
      amount,
      kind: "INCOME",
      description: input.description,
      createdById: input.createdById,
    });
    return;
  }

  if (input.method === "BANK_TRANSFER") {
    const bankAccountId = input.bankAccountId?.trim();
    if (!bankAccountId) {
      throw new Error(
        "Elegí la cuenta bancaria para registrar la transferencia en Tesorería.",
      );
    }
    await postBankMovement(tx, {
      organizationId: input.organizationId,
      bankAccountId,
      amount,
      kind: "INCOME",
      description: input.description,
      currency: input.currency,
      createdById: input.createdById,
    });
  }
}
