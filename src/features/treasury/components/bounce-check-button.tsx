"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bounceDepositedCheck } from "@/features/treasury/actions/bank-deposit-actions";
import type { CheckAllocationTarget } from "@/features/treasury/queries/list-checks";
import type { CheckStatus } from "@prisma/client";

type FeeRow = {
  key: string;
  description: string;
  amount: string;
  targetKey: string;
  passedToDrawer: boolean;
};

type BankOption = {
  id: string;
  label: string;
};

type BounceCheckButtonProps = {
  checkId: string;
  checkLabel: string;
  currency: string;
  status: Extract<CheckStatus, "DEPOSITED" | "DELIVERED">;
  drawerName: string | null;
  allocationTargets: CheckAllocationTarget[];
  bankAccounts?: BankOption[];
};

function targetKeyOf(t: CheckAllocationTarget) {
  return `${t.contractId}:${t.propertyId}`;
}

function emptyFee(defaultTargetKey: string): FeeRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: "",
    amount: "",
    targetKey: defaultTargetKey,
    passedToDrawer: false,
  };
}

export function BounceCheckButton({
  checkId,
  checkLabel,
  currency,
  status,
  drawerName,
  allocationTargets,
  bankAccounts = [],
}: BounceCheckButtonProps) {
  const router = useRouter();
  const defaultTargetKey =
    allocationTargets.length > 0 ? targetKeyOf(allocationTargets[0]) : "";
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [feeBankAccountId, setFeeBankAccountId] = useState(
    bankAccounts[0]?.id ?? "",
  );
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isDelivered = status === "DELIVERED";

  function resetForm() {
    setReason("");
    setFees([]);
    setFeeBankAccountId(bankAccounts[0]?.id ?? "");
    setError(null);
  }

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const parsedFees = fees
        .map((f) => {
          const target = allocationTargets.find(
            (t) => targetKeyOf(t) === f.targetKey,
          );
          return {
            description: f.description.trim(),
            amount: Number(String(f.amount).replace(",", ".")),
            contractId: target?.contractId ?? null,
            propertyId: target?.propertyId ?? null,
            passedToDrawer: f.passedToDrawer,
          };
        })
        .filter((f) => f.amount > 0 || f.description);

      for (const fee of parsedFees) {
        if (!(fee.amount > 0)) {
          setError("Cada gasto debe tener un monto mayor a cero.");
          return;
        }
        if (!fee.description) {
          setError("Cada gasto necesita una descripción.");
          return;
        }
        if (
          allocationTargets.length > 0 &&
          (!fee.contractId || !fee.propertyId)
        ) {
          setError("Elegí la partida a la que imputar cada gasto.");
          return;
        }
      }

      if (isDelivered && parsedFees.length > 0 && !feeBankAccountId) {
        setError("Elegí la cuenta bancaria para debitar los gastos.");
        return;
      }

      const result = await bounceDepositedCheck({
        checkId,
        reason: reason || undefined,
        fees: parsedFees,
        feeBankAccountId:
          isDelivered && parsedFees.length > 0
            ? feeBankAccountId
            : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      resetForm();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
        className="text-sm text-danger hover:underline"
      >
        Registrar rechazo
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-labelledby="bounce-check-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface-elevated p-5 shadow-lg"
          >
            <h2
              id="bounce-check-title"
              className="font-display text-lg tracking-tight"
            >
              Registrar rechazo
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {checkLabel}.{" "}
              {isDelivered
                ? "Se descontará el pago de la orden y el ingreso del recibo origen. Podés cargar gastos bancarios a favor del proveedor y, si corresponde, trasladarlos al librador."
                : "Se descontará del banco y del ingreso imputado en presupuesto. Podés cargar gastos del rechazo para sumarlos al costo de la obra."}
            </p>
            {drawerName ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Librador: <span className="text-foreground">{drawerName}</span>
              </p>
            ) : null}

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-muted-foreground">
                Motivo (opcional)
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. sin fondos, cuenta cerrada…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
              />
            </label>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Gastos del rechazo</p>
                <button
                  type="button"
                  onClick={() =>
                    setFees((prev) => [...prev, emptyFee(defaultTargetKey)])
                  }
                  className="text-sm text-accent hover:underline"
                >
                  + Agregar gasto
                </button>
              </div>
              {fees.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Opcional. Ej. comisión bancaria a favor del proveedor.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {fees.map((fee, index) => (
                    <li
                      key={fee.key}
                      className="space-y-2 rounded-md border border-border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Gasto {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setFees((prev) =>
                              prev.filter((f) => f.key !== fee.key),
                            )
                          }
                          className="text-xs text-muted-foreground hover:text-danger"
                        >
                          Quitar
                        </button>
                      </div>
                      <input
                        value={fee.description}
                        onChange={(e) =>
                          setFees((prev) =>
                            prev.map((f) =>
                              f.key === fee.key
                                ? { ...f, description: e.target.value }
                                : f,
                            ),
                          )
                        }
                        placeholder="Descripción"
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
                      />
                      <input
                        value={fee.amount}
                        onChange={(e) =>
                          setFees((prev) =>
                            prev.map((f) =>
                              f.key === fee.key
                                ? { ...f, amount: e.target.value }
                                : f,
                            ),
                          )
                        }
                        inputMode="decimal"
                        placeholder={`Monto (${currency})`}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
                      />
                      {allocationTargets.length > 0 ? (
                        <select
                          value={fee.targetKey}
                          onChange={(e) =>
                            setFees((prev) =>
                              prev.map((f) =>
                                f.key === fee.key
                                  ? { ...f, targetKey: e.target.value }
                                  : f,
                              ),
                            )
                          }
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
                        >
                          {allocationTargets.map((t) => (
                            <option key={targetKeyOf(t)} value={targetKeyOf(t)}>
                              {t.contractLabel} · {t.propertyLabel}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Sin partida vinculada: el gasto se debita del banco
                          pero no se imputa al presupuesto.
                        </p>
                      )}
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={fee.passedToDrawer}
                          onChange={(e) =>
                            setFees((prev) =>
                              prev.map((f) =>
                                f.key === fee.key
                                  ? { ...f, passedToDrawer: e.target.checked }
                                  : f,
                              ),
                            )
                          }
                          className="mt-0.5"
                        />
                        <span>
                          Trasladar al librador
                          {drawerName ? ` (${drawerName})` : ""}
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            No suma al costo de la obra; queda a cargo de quien
                            entregó el cheque.
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {isDelivered && fees.length > 0 ? (
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-muted-foreground">
                    Cuenta bancaria para los gastos
                  </span>
                  <select
                    value={feeBankAccountId}
                    onChange={(e) => setFeeBankAccountId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
                  >
                    {bankAccounts.length === 0 ? (
                      <option value="">Sin cuentas disponibles</option>
                    ) : (
                      bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              ) : null}
            </div>

            {error && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending}
                className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending ? "Registrando…" : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
