"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  generatePeriodBillsAction,
  recordPaymentAction,
  runMonthlyCloseAction,
  type DocActionResult,
} from "@/server/actions/billing";
import { DateInput } from "@/components/ui/date-input";
import { checkFormatLabel } from "@/features/treasury/lib/check-number";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;
const paymentInitial: DocActionResult | null = null;

export function GenerateBillsForm() {
  const router = useRouter();
  const now = new Date();
  const [state, formAction, pending] = useActionState(generatePeriodBillsAction, initial);
  const [closeState, closeAction, closePending] = useActionState(
    runMonthlyCloseAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok || closeState?.ok) router.refresh();
  }, [state, closeState, router]);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="space-y-1">
          <Label htmlFor="periodYear">Año</Label>
          <Input id="periodYear" name="periodYear" type="number" defaultValue={now.getFullYear()} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="periodMonth">Mes</Label>
          <Input id="periodMonth" name="periodMonth" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} required />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Generando…" : "Generar cuotas del período"}
        </Button>
        {state?.ok && state.message ? (
          <p className="w-full text-sm text-emerald-700">{state.message}</p>
        ) : null}
        {state && !state.ok ? (
          <p className="w-full text-sm text-[var(--destructive)]">{state.error}</p>
        ) : null}
      </form>

      <form action={closeAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4">
        <input type="hidden" name="periodYear" value={now.getFullYear()} />
        <input type="hidden" name="periodMonth" value={now.getMonth() + 1} />
        <div className="mr-auto space-y-1">
          <p className="text-sm font-medium">Cierre del mes</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Genera cuotas del mes en curso y sincroniza vencimientos/mora.
          </p>
        </div>
        <Button type="submit" variant="secondary" disabled={closePending}>
          {closePending ? "Ejecutando…" : "Ejecutar cierre del mes"}
        </Button>
        {closeState?.ok && closeState.message ? (
          <p className="w-full text-sm text-emerald-700">{closeState.message}</p>
        ) : null}
        {closeState && !closeState.ok ? (
          <p className="w-full text-sm text-[var(--destructive)]">{closeState.error}</p>
        ) : null}
      </form>
    </div>
  );
}

export function PaymentForm({
  billId,
  balance,
  bankAccounts = [],
  currency = "ARS",
}: {
  billId: string;
  balance: number;
  bankAccounts?: { id: string; label: string; currency: string }[];
  currency?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    recordPaymentAction,
    paymentInitial,
  );
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [isElectronicCheck, setIsElectronicCheck] = useState<string>("");

  useEffect(() => {
    if (method !== "CHECK") setIsElectronicCheck("");
  }, [method]);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      if (state.printUrl) {
        window.open(state.printUrl, "_blank", "noopener,noreferrer");
      }
    }
  }, [state, router]);

  const banksForCurrency = bankAccounts.filter(
    (b) => b.currency.toUpperCase() === currency.toUpperCase(),
  );

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
      <input type="hidden" name="tenantBillId" value={billId} />
      <div className="space-y-1">
        <Label htmlFor="amount">Monto (saldo {balance.toFixed(2)})</Label>
        <Input id="amount" name="amount" type="number" step="0.01" defaultValue={balance > 0 ? balance : undefined} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="method">Medio</Label>
        <Select
          id="method"
          name="method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="BANK_TRANSFER">Transferencia</option>
          <option value="CASH">Efectivo</option>
          <option value="CHECK">Cheque</option>
          <option value="CARD">Tarjeta</option>
          <option value="GATEWAY">Pasarela</option>
          <option value="OTHER">Otro</option>
        </Select>
      </div>
      {method === "BANK_TRANSFER" ? (
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="bankAccountId">Cuenta bancaria</Label>
          <Select id="bankAccountId" name="bankAccountId" required>
            <option value="">Elegí cuenta…</option>
            {banksForCurrency.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
          {banksForCurrency.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              No hay cuentas en {currency}. Cargalas en Ajustes → Bancos.
            </p>
          ) : null}
        </div>
      ) : null}
      {method === "CASH" ? (
        <p className="text-xs text-[var(--muted-foreground)] sm:col-span-2">
          El efectivo se registra en la caja diaria abierta (Tesorería → Caja).
        </p>
      ) : null}
      {method === "CHECK" ? (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="checkNumber">N° cheque</Label>
            <Input id="checkNumber" name="checkNumber" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="checkBank">Banco</Label>
            <Input id="checkBank" name="checkBank" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="checkDueDate">Vencimiento</Label>
            <DateInput id="checkDueDate" name="checkDueDate" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="isElectronicCheck">Tipo de cheque</Label>
            <Select
              id="isElectronicCheck"
              name="isElectronicCheck"
              required
              value={isElectronicCheck}
              onChange={(e) => setIsElectronicCheck(e.target.value)}
            >
              <option value="">Elegir…</option>
              <option value="false">Cheque físico</option>
              <option value="true">Cheque electrónico</option>
            </Select>
            {isElectronicCheck ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                {checkFormatLabel(isElectronicCheck === "true")}
              </p>
            ) : null}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="checkAccount">Cuenta (opcional)</Label>
            <Input id="checkAccount" name="checkAccount" />
          </div>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="reference">Referencia / comprobante</Label>
        <Input id="reference" name="reference" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">Notas</Label>
        <Input id="notes" name="notes" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || balance <= 0}>
          {pending ? "Registrando…" : "Registrar pago"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-2">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <div className="space-y-1 text-sm text-emerald-700 sm:col-span-2">
          <p>{state.message ?? "Pago registrado."}</p>
          {state.printUrl ? (
            <a
              href={state.printUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-2"
            >
              Abrir recibo para imprimir / WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
