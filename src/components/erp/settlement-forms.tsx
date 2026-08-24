"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PartyPersonSearchSelect } from "@/components/erp/party-person-search-select";
import {
  generateSettlementAction,
  generateSettlementsForPeriodAction,
  issueSettlementAction,
  paySettlementAction,
} from "@/server/actions/settlements";
import type { DocActionResult } from "@/server/actions/billing";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;
const payInitial: DocActionResult | null = null;

export function GenerateSettlementForm({
  owners,
}: {
  owners: {
    id: string;
    name: string;
    documentNumber?: string | null;
    email?: string | null;
  }[];
}) {
  const router = useRouter();
  const now = new Date();
  const [ownerId, setOwnerId] = useState("");
  const [state, formAction, pending] = useActionState(generateSettlementAction, initial);
  const [batchState, batchAction, batchPending] = useActionState(
    generateSettlementsForPeriodAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok || batchState?.ok) router.refresh();
  }, [state, batchState, router]);

  return (
    <div className="space-y-3">
      <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="ownerId">Propietario</Label>
          <PartyPersonSearchSelect
            id="ownerId"
            name="ownerId"
            kind="OWNER"
            value={ownerId}
            onChange={setOwnerId}
            options={owners}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="periodYear">Año</Label>
          <Input id="periodYear" name="periodYear" type="number" defaultValue={now.getFullYear()} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="periodMonth">Mes</Label>
          <Input id="periodMonth" name="periodMonth" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="currency">Moneda</Label>
          <Select id="currency" name="currency" defaultValue="ARS">
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </Select>
        </div>
        <div className="lg:col-span-5">
          <Button type="submit" disabled={pending}>
            {pending ? "Calculando…" : "Generar liquidación"}
          </Button>
        </div>
        {state && !state.ok ? (
          <p className="text-sm text-[var(--destructive)] lg:col-span-5">{state.error}</p>
        ) : null}
      </form>

      <form
        action={batchAction}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4"
      >
        <div className="space-y-1">
          <Label htmlFor="batchYear">Año</Label>
          <Input
            id="batchYear"
            name="periodYear"
            type="number"
            defaultValue={now.getFullYear()}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="batchMonth">Mes</Label>
          <Input
            id="batchMonth"
            name="periodMonth"
            type="number"
            min={1}
            max={12}
            defaultValue={now.getMonth() + 1}
            required
          />
        </div>
        <input type="hidden" name="currency" value="ARS" />
        <div className="mr-auto space-y-1">
          <p className="text-sm font-medium">Rendiciones del período</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Genera borradores para todos los propietarios con cartera.
          </p>
        </div>
        <Button type="submit" variant="secondary" disabled={batchPending}>
          {batchPending ? "Generando…" : "Generar todas (ARS)"}
        </Button>
        {batchState?.ok && batchState.message ? (
          <p className="w-full text-sm text-emerald-700">{batchState.message}</p>
        ) : null}
        {batchState && !batchState.ok ? (
          <p className="w-full text-sm text-[var(--destructive)]">{batchState.error}</p>
        ) : null}
      </form>
    </div>
  );
}

export function SettlementActions({
  id,
  status,
  currency = "ARS",
  bankAccounts = [],
}: {
  id: string;
  status: string;
  currency?: string;
  bankAccounts?: { id: string; label: string; currency: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [payState, payAction, payPending] = useActionState(
    paySettlementAction,
    payInitial,
  );
  const [method, setMethod] = useState("BANK_TRANSFER");

  useEffect(() => {
    if (payState?.ok) {
      router.refresh();
      if (payState.printUrl) {
        window.open(payState.printUrl, "_blank", "noopener,noreferrer");
      }
    }
  }, [payState, router]);

  const banksForCurrency = bankAccounts.filter(
    (b) => b.currency.toUpperCase() === currency.toUpperCase(),
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      {status === "DRAFT" ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await issueSettlementAction(id);
              router.refresh();
            })
          }
        >
          Emitir
        </Button>
      ) : null}

      {status === "ISSUED" ? (
        <form
          action={payAction}
          className="flex w-full flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <input type="hidden" name="id" value={id} />
          <div className="space-y-1">
            <Label htmlFor="method">Medio de pago</Label>
            <Select
              id="method"
              name="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="BANK_TRANSFER">Transferencia</option>
              <option value="CASH">Efectivo</option>
              <option value="CHECK">Cheque</option>
              <option value="OTHER">Otro</option>
            </Select>
          </div>
          {method === "BANK_TRANSFER" ? (
            <div className="space-y-1 min-w-[220px]">
              <Label htmlFor="bankAccountId">Cuenta bancaria</Label>
              <Select id="bankAccountId" name="bankAccountId" required>
                <option value="">Elegí cuenta…</option>
                {banksForCurrency.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="transferRef">Ref. transferencia</Label>
            <Input id="transferRef" name="transferRef" />
          </div>
          <Button type="submit" disabled={payPending}>
            {payPending ? "Pagando…" : "Pagar (generar OP)"}
          </Button>
          {payState && !payState.ok ? (
            <p className="w-full text-sm text-[var(--destructive)]">
              {payState.error}
            </p>
          ) : null}
          {payState?.ok ? (
            <div className="w-full space-y-1 text-sm text-emerald-700">
              <p>{payState.message}</p>
              {payState.printUrl ? (
                <a
                  href={payState.printUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline underline-offset-2"
                >
                  Abrir orden de pago para imprimir / WhatsApp
                </a>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
