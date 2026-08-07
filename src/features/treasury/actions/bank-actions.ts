"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { postBankMovement } from "@/features/treasury/lib/bank-from-treasury";
import { normalizeCurrency } from "@/config/currencies";

export type BankAccountInput = {
  name: string;
  bankName: string;
  accountNumber?: string;
  cbu?: string;
  alias?: string;
  currency?: string;
  openingBalance?: number;
  notes?: string;
};

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function canManage(role: string) {
  return ["ADMIN", "AGENT"].includes(role);
}

function revalidateBanks(id?: string) {
  revalidatePath("/ajustes");
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/bancos");
  if (id) revalidatePath(`/tesoreria/bancos/${id}`);
  revalidatePath("/tesoreria/recibos/new");
  revalidatePath("/tesoreria/ordenes-pago/new");
}

export async function createBankAccount(
  input: BankAccountInput,
): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "No tienes permiso para crear cuentas." };
    }

    const name = input.name.trim();
    const bankName = input.bankName.trim();
    if (!name) return { ok: false, error: "El nombre es obligatorio." };
    if (!bankName) return { ok: false, error: "El banco es obligatorio." };

    const currency = normalizeCurrency(input.currency || "ARS");
    const opening = Number(input.openingBalance) || 0;

    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.bankAccount.create({
        data: {
          organizationId: session.organizationId,
          name,
          bankName,
          accountNumber: input.accountNumber?.trim() || null,
          cbu: input.cbu?.trim() || null,
          alias: input.alias?.trim() || null,
          currency,
          balance: 0,
          notes: input.notes?.trim() || null,
        },
      });

      if (Math.abs(opening) > 0.009) {
        await postBankMovement(tx, {
          organizationId: session.organizationId,
          bankAccountId: created.id,
          amount: Math.abs(opening),
          kind: "OPENING",
          description: "Saldo inicial",
          currency,
          createdById: session.user.id,
        });
      }

      return created;
    });

    revalidateBanks(account.id);
    return { ok: true, id: account.id };
  } catch (error) {
    console.error("createBankAccount", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo crear la cuenta bancaria.",
    };
  }
}

export async function updateBankAccount(
  id: string,
  input: BankAccountInput & { isActive?: boolean },
): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "No tienes permiso para editar cuentas." };
    }

    const existing = await prisma.bankAccount.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!existing) return { ok: false, error: "Cuenta no encontrada." };

    const name = input.name.trim();
    const bankName = input.bankName.trim();
    if (!name) return { ok: false, error: "El nombre es obligatorio." };
    if (!bankName) return { ok: false, error: "El banco es obligatorio." };

    await prisma.bankAccount.update({
      where: { id },
      data: {
        name,
        bankName,
        accountNumber: input.accountNumber?.trim() || null,
        cbu: input.cbu?.trim() || null,
        alias: input.alias?.trim() || null,
        notes: input.notes?.trim() || null,
        ...(typeof input.isActive === "boolean"
          ? { isActive: input.isActive }
          : {}),
      },
    });

    revalidateBanks(id);
    return { ok: true, id };
  } catch (error) {
    console.error("updateBankAccount", error);
    return { ok: false, error: "No se pudo actualizar la cuenta." };
  }
}

export async function addBankAdjustment(input: {
  bankAccountId: string;
  amount: number;
  description: string;
}): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!["ADMIN", "AGENT"].includes(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) {
      return { ok: false, error: "Ingresá un monto distinto de cero." };
    }
    const description = input.description.trim();
    if (!description) {
      return { ok: false, error: "La descripción es obligatoria." };
    }

    await prisma.$transaction(async (tx) => {
      await postBankMovement(tx, {
        organizationId: session.organizationId,
        bankAccountId: input.bankAccountId,
        amount,
        kind: "ADJUSTMENT",
        description,
        createdById: session.user.id,
      });
    });

    revalidateBanks(input.bankAccountId);
    return { ok: true, id: input.bankAccountId };
  } catch (error) {
    console.error("addBankAdjustment", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo registrar el ajuste.",
    };
  }
}
