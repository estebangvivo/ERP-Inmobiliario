"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import {
  applyLateFee,
  generateBillsForPeriod,
} from "@/server/services/billing";
import { runMonthlyBillingJob } from "@/server/services/monthly-job";
import { issueReceiptForBillPayments, type BillingCheckDetails } from "@/features/treasury/lib/issue-docs-from-billing";
import { formatInstallmentLabel } from "@/features/billing/lib/installment-label";
import type { ActionResult } from "@/server/actions/users";

export type DocActionResult =
  | {
      ok: true;
      message?: string;
      printUrl?: string;
      documentNumber?: string;
    }
  | { ok: false; error: string; printUrl?: string };

function revalidateAfterReceipt(opts: {
  billIds: string[];
  tenantId?: string;
  receiptId: string;
}) {
  for (const billId of opts.billIds) {
    revalidatePath(`/cobros/${billId}`);
  }
  revalidatePath("/cobros");
  revalidatePath("/cobros/cuenta-corriente");
  if (opts.tenantId) {
    revalidatePath(`/cobros/cuenta-corriente/${opts.tenantId}`);
    revalidatePath(`/tesoreria/cuentas/inquilinos/${opts.tenantId}`);
  }
  revalidatePath("/tesoreria");
  revalidatePath("/tesoreria/recibos");
  revalidatePath(`/tesoreria/recibos/${opts.receiptId}`);
  revalidatePath("/tesoreria/caja");
  revalidatePath("/tesoreria/bancos");
  revalidatePath("/tesoreria/cuentas");
}

export async function generatePeriodBillsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const year = Number(formData.get("periodYear"));
  const month = Number(formData.get("periodMonth"));
  if (!year || !month || month < 1 || month > 12) {
    return { ok: false, error: "Período inválido" };
  }

  try {
    const bills = await generateBillsForPeriod(
      session.organizationId,
      year,
      month,
    );
    revalidatePath("/cobros");
    return {
      ok: true,
      message: `Se generaron/actualizaron ${bills.length} cuotas`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al generar",
    };
  }
}

export async function runMonthlyCloseAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff();
  const year = Number(formData.get("periodYear"));
  const month = Number(formData.get("periodMonth"));
  if (!year || !month || month < 1 || month > 12) {
    return { ok: false, error: "Período inválido" };
  }

  try {
    const result = await runMonthlyBillingJob({
      year,
      month,
      organizationId: session.organizationId,
    });
    const row = result.results[0];
    revalidatePath("/cobros");
    revalidatePath("/dashboard");
    revalidatePath("/rendiciones");
    return {
      ok: true,
      message: row?.error
        ? `Error: ${row.error}`
        : `Cierre ${month}/${year}: ${row?.bills ?? 0} cuotas, ${row?.overdueSynced ?? 0} vencidas sync.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error en cierre mensual",
    };
  }
}

export async function recordPaymentAction(
  _prev: DocActionResult | null,
  formData: FormData,
): Promise<DocActionResult> {
  const session = await requireStaff();
  const tenantBillId = String(formData.get("tenantBillId") ?? "");
  const amount = Number(formData.get("amount"));
  const method = String(formData.get("method") ?? "BANK_TRANSFER") as
    | "CASH"
    | "BANK_TRANSFER"
    | "CHECK"
    | "CARD"
    | "GATEWAY"
    | "OTHER";
  const reference = String(formData.get("reference") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();

  if (!tenantBillId || !(amount > 0)) {
    return { ok: false, error: "Cuota y monto son obligatorios" };
  }

  if (method === "BANK_TRANSFER" && !bankAccountId) {
    return { ok: false, error: "Elegí la cuenta bancaria para la transferencia." };
  }

  const checkParsed = parseCheckFromFormData(method, formData);
  if (checkParsed && !checkParsed.ok) {
    return { ok: false, error: checkParsed.error };
  }

  try {
    const bill = await prisma.tenantBill.findFirst({
      where: {
        id: tenantBillId,
        contract: { organizationId: session.organizationId },
      },
      include: {
        contract: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            parties: {
              where: { role: "TENANT" },
              take: 1,
              select: { userId: true },
            },
          },
        },
      },
    });
    if (!bill) return { ok: false, error: "Cuota no encontrada." };

    const balance = round2(Number(bill.totalAmount) - Number(bill.paidAmount));
    if (amount > balance + 0.009) {
      return { ok: false, error: "El monto supera el saldo de la cuota." };
    }

    const tenantId = bill.contract.parties[0]?.userId;
    const installment = formatInstallmentLabel({
      contractStart: bill.contract.startDate,
      contractEnd: bill.contract.endDate,
      periodYear: bill.periodYear,
      periodMonth: bill.periodMonth,
    });
    const result = await issueReceiptForBillPayments({
      tenantId,
      currency: bill.currency,
      method,
      bankAccountId: bankAccountId || undefined,
      reference: reference || undefined,
      notes: notes || undefined,
      check: checkParsed?.ok ? checkParsed.check : undefined,
      allocations: [
        {
          billId: bill.id,
          contractId: bill.contractId,
          amount: round2(amount),
          description: installment,
        },
      ],
    });

    if (!result.ok) return { ok: false, error: result.error };

    if (result.postError) {
      return {
        ok: false,
        error: `${result.postError} El recibo ${result.number} quedó en borrador en Tesorería.`,
        printUrl: `/tesoreria/recibos/${result.id}/print`,
      };
    }

    revalidateAfterReceipt({
      billIds: [bill.id],
      tenantId,
      receiptId: result.id,
    });

    const printUrl = `/tesoreria/recibos/${result.id}/print?autoPrint=1`;
    return {
      ok: true,
      message: `Recibo ${result.number} generado.`,
      printUrl,
      documentNumber: result.number,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al registrar pago",
    };
  }
}

export async function applyLateFeeAction(billId: string): Promise<ActionResult> {
  await requireStaff();
  try {
    await applyLateFee(billId);
    revalidatePath("/cobros");
    revalidatePath(`/cobros/${billId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al calcular mora",
    };
  }
}

const CONCEPT_LABELS: Record<string, string> = {
  rent: "Alquiler",
  ordinary: "Expensas ordinarias",
  extraordinary: "Expensas extraordinarias",
  services: "Servicios",
  servicesExtraordinary: "Servicios extraordinarios",
  commission: "Honorarios",
  lateFee: "Mora",
  other: "Otros",
};

export async function applyTenantLedgerPaymentAction(input: {
  tenantId: string;
  billIds: string[];
  mode: "pay_all" | "pay_selected" | "pay_amount";
  amount?: number;
  method: "CASH" | "BANK_TRANSFER" | "CHECK" | "CARD" | "GATEWAY" | "OTHER";
  reference?: string;
  notes?: string;
  conceptsByBill?: Record<string, string[]>;
  bankAccountId?: string;
}): Promise<DocActionResult> {
  const session = await requireStaff();

  if (!input.tenantId || !input.billIds.length) {
    return { ok: false, error: "Inquilino y cuotas son obligatorios." };
  }

  if (input.method === "BANK_TRANSFER" && !input.bankAccountId) {
    return { ok: false, error: "Elegí la cuenta bancaria para la transferencia." };
  }

  const bills = await prisma.tenantBill.findMany({
    where: {
      id: { in: input.billIds },
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      contract: {
        organizationId: session.organizationId,
        parties: {
          some: { role: "TENANT", userId: input.tenantId },
        },
      },
    },
    include: {
      contract: { select: { id: true, startDate: true, endDate: true } },
    },
    orderBy: [{ dueDate: "asc" }, { periodYear: "asc" }, { periodMonth: "asc" }],
  });

  if (bills.length === 0) {
    return { ok: false, error: "No hay cuotas abiertas válidas." };
  }

  const currencies = new Set(bills.map((b) => b.currency));
  if (currencies.size > 1) {
    return {
      ok: false,
      error: "Seleccioná cuotas de una sola moneda por cobro.",
    };
  }

  type Alloc = { billId: string; amount: number; noteExtra: string };
  const allocations: Alloc[] = [];

  if (input.mode === "pay_all" || input.mode === "pay_selected") {
    for (const bill of bills) {
      const balance = round2(Number(bill.totalAmount) - Number(bill.paidAmount));
      if (balance <= 0) continue;
      const concepts = input.conceptsByBill?.[bill.id] ?? [];
      const noteExtra = concepts.length
        ? concepts.map((c) => CONCEPT_LABELS[c] ?? c).join(", ")
        : "Saldo completo";
      allocations.push({ billId: bill.id, amount: balance, noteExtra });
    }
  } else {
    let remaining = round2(input.amount ?? 0);
    if (!(remaining > 0)) {
      return { ok: false, error: "Monto inválido." };
    }
    for (const bill of bills) {
      if (remaining <= 0) break;
      const balance = round2(Number(bill.totalAmount) - Number(bill.paidAmount));
      if (balance <= 0) continue;
      const apply = Math.min(balance, remaining);
      const concepts = input.conceptsByBill?.[bill.id] ?? [];
      const noteExtra = concepts.length
        ? concepts.map((c) => CONCEPT_LABELS[c] ?? c).join(", ")
        : "Pago parcial / FIFO";
      allocations.push({ billId: bill.id, amount: apply, noteExtra });
      remaining = round2(remaining - apply);
    }
    if (allocations.length === 0) {
      return { ok: false, error: "No se pudo aplicar el monto." };
    }
  }

  const billById = new Map(bills.map((b) => [b.id, b]));
  const totalPaid = round2(
    allocations.reduce((s, a) => s + a.amount, 0),
  );

  try {
    const noteParts = [
      input.notes?.trim(),
      "Cuenta corriente",
    ].filter(Boolean);

    const result = await issueReceiptForBillPayments({
      tenantId: input.tenantId,
      currency: bills[0].currency,
      method: input.method,
      bankAccountId: input.bankAccountId,
      reference: input.reference,
      notes: noteParts.join(" · ") || undefined,
      allocations: allocations.map((a) => {
        const bill = billById.get(a.billId)!;
        const installment = formatInstallmentLabel({
          contractStart: bill.contract.startDate,
          contractEnd: bill.contract.endDate,
          periodYear: bill.periodYear,
          periodMonth: bill.periodMonth,
        });
        return {
          billId: a.billId,
          contractId: bill.contractId,
          amount: a.amount,
          description: `${installment} · ${a.noteExtra}`,
        };
      }),
    });

    if (!result.ok) return { ok: false, error: result.error };

    if (result.postError) {
      return {
        ok: false,
        error: `${result.postError} El recibo ${result.number} quedó en borrador en Tesorería.`,
        printUrl: `/tesoreria/recibos/${result.id}/print`,
      };
    }

    revalidateAfterReceipt({
      billIds: allocations.map((a) => a.billId),
      tenantId: input.tenantId,
      receiptId: result.id,
    });

    const printUrl = `/tesoreria/recibos/${result.id}/print?autoPrint=1`;
    return {
      ok: true,
      message: `Recibo ${result.number} por ${totalPaid.toLocaleString("es-AR")} (${allocations.length} cuota(s)).`,
      printUrl,
      documentNumber: result.number,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al registrar cobros",
    };
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseCheckFromFormData(
  method: string,
  formData: FormData,
): { ok: true; check: BillingCheckDetails } | { ok: false; error: string } | null {
  if (method !== "CHECK") return null;

  const checkNumber = String(formData.get("checkNumber") ?? "").trim();
  const checkBank = String(formData.get("checkBank") ?? "").trim();
  const isElectronicRaw = String(formData.get("isElectronicCheck") ?? "");
  const checkDueDate = String(formData.get("checkDueDate") ?? "").trim();
  const checkAccount = String(formData.get("checkAccount") ?? "").trim();

  if (!checkNumber || !checkBank) {
    return { ok: false, error: "Completá número y banco del cheque." };
  }
  if (isElectronicRaw !== "true" && isElectronicRaw !== "false") {
    return {
      ok: false,
      error: "Indicá si el cheque es electrónico o físico.",
    };
  }

  return {
    ok: true,
    check: {
      checkNumber,
      checkBank,
      isElectronicCheck: isElectronicRaw === "true",
      checkDueDate: checkDueDate || undefined,
      checkAccount: checkAccount || undefined,
    },
  };
}
