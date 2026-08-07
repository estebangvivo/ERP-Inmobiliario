"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  applyDepositToBalanceAction,
  updateDepositAction,
} from "@/server/actions/contracts";
import type { ActionResult } from "@/server/actions/users";
import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";

const initial: ActionResult | null = null;

export function DepositCard({
  contractId,
  depositAmount,
  depositHeld,
  currency,
  warnOnClose,
}: {
  contractId: string;
  depositAmount: string;
  depositHeld: boolean;
  currency: Currency;
  warnOnClose?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateDepositAction, initial);
  const [applyPending, startApply] = useTransition();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Depósito / garantía</CardTitle>
        <Badge variant={depositHeld ? "warning" : "secondary"}>
          {depositHeld ? "En custodia" : "Devuelto / aplicado"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-2xl font-semibold">
          {formatMoney(depositAmount, currency)}
        </p>
        {warnOnClose && depositHeld ? (
          <p className="text-sm text-amber-700">
            El contrato está cerrado y el depósito sigue en custodia. Devolvelo o
            aplicálo al saldo.
          </p>
        ) : null}

        <form action={formAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="contractId" value={contractId} />
          <div className="space-y-1">
            <Label htmlFor="depositAmount">Monto</Label>
            <Input
              id="depositAmount"
              name="depositAmount"
              type="number"
              step="0.01"
              min={0}
              defaultValue={depositAmount}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="depositHeld">Estado</Label>
            <select
              id="depositHeld"
              name="depositHeld"
              defaultValue={depositHeld ? "true" : "false"}
              className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            >
              <option value="true">En custodia</option>
              <option value="false">Devuelto</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="note">Nota</Label>
            <Input id="note" name="note" placeholder="Opcional" />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar depósito"}
            </Button>
            {depositHeld && Number(depositAmount) > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={applyPending}
                onClick={() =>
                  startApply(async () => {
                    await applyDepositToBalanceAction(contractId);
                    router.refresh();
                  })
                }
              >
                {applyPending ? "Aplicando…" : "Aplicar a saldo"}
              </Button>
            ) : null}
          </div>
          {state && !state.ok ? (
            <p className="text-sm text-[var(--destructive)] sm:col-span-2">
              {state.error}
            </p>
          ) : null}
          {state?.ok && state.message ? (
            <p className="text-sm text-emerald-700 sm:col-span-2">{state.message}</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
