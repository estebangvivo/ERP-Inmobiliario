"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyRecoverableToSettlementAction } from "@/server/actions/recoverable-charges";
import type { ActionResult } from "@/server/actions/users";
import { formatMoney } from "@/lib/money";

const initial: ActionResult | null = null;

export function SettlementRecoverablePanel({
  settlementId,
  ownerId,
  status,
  currency,
  charges,
}: {
  settlementId: string;
  ownerId: string;
  status: string;
  currency: string;
  charges: {
    id: string;
    propertyTitle: string;
    workOrderCode: string;
    workOrderTitle: string;
    pending: number;
  }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    applyRecoverableToSettlementAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (charges.length === 0) return null;

  const total = charges.reduce((s, c) => s + c.pending, 0);

  return (
    <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-50/50 p-4 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-amber-950 dark:text-amber-100">
            Gastos a recuperar pendientes
          </h3>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
            Este propietario tiene {formatMoney(String(total), currency as "ARS" | "USD" | "EUR")}{" "}
            en cuenta paralela (no entran solos a la liquidación).
          </p>
        </div>
        <Link
          href={`/tesoreria/cuentas/recuperables/${ownerId}`}
          className="text-sm text-[var(--primary)] hover:underline"
        >
          Ver cuenta recuperables →
        </Link>
      </div>

      {status === "DRAFT" ? (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="settlementId" value={settlementId} />
          <ul className="space-y-2">
            {charges.map((c) => (
              <li
                key={c.id}
                className="grid gap-2 sm:grid-cols-[1fr_8rem] sm:items-end"
              >
                <div>
                  <p className="text-sm font-medium">
                    {c.workOrderCode} · {c.workOrderTitle}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {c.propertyTitle} · pendiente{" "}
                    {formatMoney(String(c.pending), currency as "ARS" | "USD" | "EUR")}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`chargeAmount_${c.id}`}>Deducir</Label>
                  <Input
                    id={`chargeAmount_${c.id}`}
                    name={`chargeAmount_${c.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    max={c.pending}
                    placeholder="0"
                  />
                </div>
              </li>
            ))}
          </ul>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Aplicando…" : "Deducir de esta rendición"}
          </Button>
          {state && !state.ok ? (
            <p className="text-sm text-[var(--destructive)]">{state.error}</p>
          ) : null}
          {state?.ok && state.message ? (
            <p className="text-sm text-emerald-700">{state.message}</p>
          ) : null}
        </form>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">
          Para deducir montos, la rendición debe estar en borrador.
        </p>
      )}
    </section>
  );
}

export function RecoverableOwnerWarning({
  ownerId,
  balanceLabel,
}: {
  ownerId: string;
  balanceLabel: string;
}) {
  return (
    <p className="rounded-md border border-amber-500/40 bg-amber-50/60 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
      Atención: este propietario tiene gastos a recuperar ({balanceLabel}).{" "}
      <Link
        href={`/tesoreria/cuentas/recuperables/${ownerId}`}
        className="underline"
      >
        Ver cuenta paralela
      </Link>
    </p>
  );
}
