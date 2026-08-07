"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { parseDateInput } from "@/lib/dates";
import {
  ensureCashRegisters,
  nextCashSessionNumber,
  toNumber,
} from "@/features/treasury/lib/cash-helpers";
import { round2 } from "@/features/treasury/lib/cash-labels";
import { normalizeCurrency } from "@/config/currencies";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function canManage(role: string) {
  return ["ADMIN", "AGENT"].includes(role);
}

function revalidateCash(sessionId?: string) {
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/caja");
  revalidatePath("/tesoreria/caja/tesoreria");
  if (sessionId) revalidatePath(`/tesoreria/caja/sesiones/${sessionId}`);
}

export async function openDailyCashSession(input: {
  businessDate?: string;
  openingBalance?: number;
  currency?: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const currency = normalizeCurrency(input.currency ?? "ARS");
    const { daily } = await ensureCashRegisters(
      session.organizationId,
      currency,
    );

    const existingOpen = await prisma.cashSession.findFirst({
      where: {
        organizationId: session.organizationId,
        registerId: daily.id,
        status: "OPEN",
      },
    });
    if (existingOpen) {
      return {
        ok: false,
        error: `Ya hay una caja abierta (${existingOpen.number}). Cerrala antes de abrir otra.`,
      };
    }

    const businessDate =
      parseDateInput(input.businessDate ?? "") ??
      parseDateInput(new Date().toISOString().slice(0, 10))!;
    const openingBalance = round2(Math.max(0, Number(input.openingBalance) || 0));
    const number = await nextCashSessionNumber(session.organizationId);

    const cashSession = await prisma.$transaction(async (tx) => {
      const created = await tx.cashSession.create({
        data: {
          organizationId: session.organizationId,
          registerId: daily.id,
          number,
          businessDate,
          status: "OPEN",
          currency,
          openingBalance,
          notes: input.notes?.trim() || null,
          openedById: session.user.id,
        },
      });

      if (openingBalance > 0) {
        await tx.cashMovement.create({
          data: {
            organizationId: session.organizationId,
            registerId: daily.id,
            sessionId: created.id,
            type: "OPENING",
            amount: openingBalance,
            balanceAfter: openingBalance,
            description: "Fondo de apertura",
            createdById: session.user.id,
          },
        });
      }

      await tx.cashRegister.update({
        where: { id: daily.id },
        data: { balance: openingBalance },
      });

      return created;
    });

    revalidateCash(cashSession.id);
    return { ok: true, id: cashSession.id };
  } catch (error) {
    console.error("openDailyCashSession", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo abrir la caja.",
    };
  }
}

export async function addDailyCashMovement(input: {
  sessionId: string;
  kind: "INCOME" | "EXPENSE" | "ADJUSTMENT";
  amount: number;
  description: string;
}): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const cashSession = await prisma.cashSession.findFirst({
      where: {
        id: input.sessionId,
        organizationId: session.organizationId,
      },
    });
    if (!cashSession) return { ok: false, error: "Sesión no encontrada." };
    if (cashSession.status !== "OPEN") {
      return { ok: false, error: "La caja no está abierta." };
    }

    const description = input.description.trim();
    if (!description) return { ok: false, error: "La descripción es obligatoria." };

    const abs = round2(Math.abs(Number(input.amount) || 0));
    if (abs <= 0) return { ok: false, error: "El monto debe ser mayor a 0." };

    let signed = abs;
    if (input.kind === "EXPENSE") signed = -abs;
    if (input.kind === "ADJUSTMENT") {
      // Adjustment: positive amount = increase, allow negative via kind? Use signed from amount input
      signed = round2(Number(input.amount) || 0);
      if (signed === 0) return { ok: false, error: "El ajuste no puede ser 0." };
    }

    await prisma.$transaction(async (tx) => {
      const register = await tx.cashRegister.findUniqueOrThrow({
        where: { id: cashSession.registerId },
      });
      const balanceAfter = round2(toNumber(register.balance) + signed);

      await tx.cashMovement.create({
        data: {
          organizationId: session.organizationId,
          registerId: cashSession.registerId,
          sessionId: cashSession.id,
          type: input.kind,
          amount: signed,
          balanceAfter,
          description,
          createdById: session.user.id,
        },
      });

      await tx.cashRegister.update({
        where: { id: cashSession.registerId },
        data: { balance: balanceAfter },
      });
    });

    revalidateCash(cashSession.id);
    return { ok: true, id: cashSession.id };
  } catch (error) {
    console.error("addDailyCashMovement", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo registrar el movimiento.",
    };
  }
}

export async function closeDailyCashSession(input: {
  sessionId: string;
  countedBalance: number;
  transferToTreasury?: boolean;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const cashSession = await prisma.cashSession.findFirst({
      where: {
        id: input.sessionId,
        organizationId: session.organizationId,
      },
      include: {
        movements: true,
        register: true,
      },
    });
    if (!cashSession) return { ok: false, error: "Sesión no encontrada." };
    if (cashSession.status !== "OPEN") {
      return { ok: false, error: "La caja ya está cerrada." };
    }

    const expectedBalance = round2(
      cashSession.movements
        .filter((m) => m.type !== "CLOSE_TRANSFER")
        .reduce((a, m) => a + toNumber(m.amount), 0),
    );
    const countedBalance = round2(Math.max(0, Number(input.countedBalance) || 0));
    const difference = round2(countedBalance - expectedBalance);
    const transfer = input.transferToTreasury !== false;
    const transferAmount = countedBalance;

    const { treasury } = await ensureCashRegisters(
      session.organizationId,
      cashSession.currency,
    );

    await prisma.$transaction(async (tx) => {
      if (transfer && transferAmount > 0) {
        const dailyAfter = 0;
        const treasuryAfter = round2(
          toNumber(treasury.balance) + transferAmount,
        );

        await tx.cashMovement.create({
          data: {
            organizationId: session.organizationId,
            registerId: cashSession.registerId,
            sessionId: cashSession.id,
            type: "CLOSE_TRANSFER",
            amount: -transferAmount,
            balanceAfter: dailyAfter,
            description: `Cierre ${cashSession.number} → tesorería`,
            createdById: session.user.id,
          },
        });

        await tx.cashMovement.create({
          data: {
            organizationId: session.organizationId,
            registerId: treasury.id,
            sessionId: null,
            type: "TREASURY_IN",
            amount: transferAmount,
            balanceAfter: treasuryAfter,
            description: `Cierre de ${cashSession.number}`,
            sourceSessionId: cashSession.id,
            createdById: session.user.id,
          },
        });

        await tx.cashRegister.update({
          where: { id: cashSession.registerId },
          data: { balance: dailyAfter },
        });
        await tx.cashRegister.update({
          where: { id: treasury.id },
          data: { balance: treasuryAfter },
        });
      } else {
        await tx.cashRegister.update({
          where: { id: cashSession.registerId },
          data: { balance: countedBalance },
        });
      }

      await tx.cashSession.update({
        where: { id: cashSession.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedById: session.user.id,
          expectedBalance,
          countedBalance,
          difference,
          transferredAmount: transfer ? transferAmount : 0,
          notes: input.notes?.trim() || cashSession.notes,
        },
      });
    });

    revalidateCash(cashSession.id);
    return { ok: true, id: cashSession.id };
  } catch (error) {
    console.error("closeDailyCashSession", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo cerrar la caja.",
    };
  }
}

export async function addTreasuryMovement(input: {
  kind: "TREASURY_DEPOSIT" | "TREASURY_WITHDRAWAL";
  amount: number;
  description: string;
  currency?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireStaff();
    if (!canManage(session.organizationRole)) {
      return { ok: false, error: "Sin permiso." };
    }

    const currency = normalizeCurrency(input.currency ?? "ARS");
    const { treasury } = await ensureCashRegisters(
      session.organizationId,
      currency,
    );

    const description = input.description.trim();
    if (!description) return { ok: false, error: "La descripción es obligatoria." };

    const abs = round2(Math.abs(Number(input.amount) || 0));
    if (abs <= 0) return { ok: false, error: "El monto debe ser mayor a 0." };

    const signed =
      input.kind === "TREASURY_WITHDRAWAL" ? -abs : abs;

    if (
      input.kind === "TREASURY_WITHDRAWAL" &&
      abs > toNumber(treasury.balance) + 0.001
    ) {
      return { ok: false, error: "Saldo insuficiente en caja tesorería." };
    }

    await prisma.$transaction(async (tx) => {
      const current = await tx.cashRegister.findUniqueOrThrow({
        where: { id: treasury.id },
      });
      const balanceAfter = round2(toNumber(current.balance) + signed);

      await tx.cashMovement.create({
        data: {
          organizationId: session.organizationId,
          registerId: treasury.id,
          type: input.kind,
          amount: signed,
          balanceAfter,
          description,
          createdById: session.user.id,
        },
      });

      await tx.cashRegister.update({
        where: { id: treasury.id },
        data: { balance: balanceAfter },
      });
    });

    revalidateCash();
    return { ok: true, id: treasury.id };
  } catch (error) {
    console.error("addTreasuryMovement", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo registrar.",
    };
  }
}
