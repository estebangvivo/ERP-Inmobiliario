"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { postBankMovement } from "@/features/treasury/lib/bank-from-treasury";
import { toNumber } from "@/features/treasury/lib/cash-helpers";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function canManage(role: string) {
  return ["ADMIN", "AGENT"].includes(role);
}

/**
 * Al cumplirse el plazo de un cheque propio entregado:
 * debita la cuenta emisora y marca el cheque como Depositado.
 */
export async function debitOwnCheck(checkId: string): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const check = await tx.checkInstrument.findFirst({
        where: {
          id: checkId,
          organizationId: session.organizationId,
          kind: "OWN",
        },
      });
      if (!check) throw new Error("Cheque propio no encontrado.");
      if (check.status !== "DELIVERED") {
        throw new Error(
          "Solo se pueden debitar cheques propios entregados pendientes.",
        );
      }
      if (!check.issuedFromBankAccountId) {
        throw new Error("El cheque no tiene cuenta emisora.");
      }
      if (check.dueDate) {
        const due = new Date(
          check.dueDate.getUTCFullYear(),
          check.dueDate.getUTCMonth(),
          check.dueDate.getUTCDate(),
        );
        const today = new Date();
        const todayLocal = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        );
        if (due.getTime() > todayLocal.getTime()) {
          throw new Error(
            "Todavía no llegó la fecha de vencimiento del cheque.",
          );
        }
      }

      const amount = toNumber(check.amount);
      await postBankMovement(tx, {
        organizationId: session.organizationId,
        bankAccountId: check.issuedFromBankAccountId,
        amount,
        kind: "EXPENSE",
        description: `Débito cheque propio ${check.number} · ${check.bank}`,
        currency: check.currency,
        checkInstrumentId: check.id,
        paymentOrderId: check.paymentOrderId ?? undefined,
        createdById: session.user.id,
      });

      await tx.checkInstrument.update({
        where: { id: check.id },
        data: {
          status: "DEPOSITED",
          depositedAt: new Date(),
          depositedBankAccountId: check.issuedFromBankAccountId,
        },
      });

      return {
        bankAccountId: check.issuedFromBankAccountId,
        paymentOrderId: check.paymentOrderId,
      };
    });

    revalidatePath("/tesoreria");
    revalidatePath("/tesoreria/checks");
    revalidatePath("/tesoreria/bancos");
    revalidatePath(`/tesoreria/bancos/${result.bankAccountId}`);
    revalidatePath("/", "layout");
    if (result.paymentOrderId) {
      revalidatePath(`/tesoreria/payment-orders/${result.paymentOrderId}`);
    }
    return { ok: true, id: checkId };
  } catch (error) {
    console.error("debitOwnCheck", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo debitar el cheque propio.",
    };
  }
}
