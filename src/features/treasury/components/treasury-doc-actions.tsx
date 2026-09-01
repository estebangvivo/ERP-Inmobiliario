"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TreasuryPaymentMethod, TreasuryDocStatus } from "@prisma/client";
import {
  cancelPaymentOrder,
  cancelReceipt,
  issuePaymentOrder,
  issueReceipt,
  postPaymentOrder,
  postReceipt,
  syncPostedDocumentToBank,
  syncPostedDocumentToCash,
} from "@/features/treasury/actions/treasury-actions";
import { withOpenCashRetry } from "@/features/treasury/lib/with-open-cash-retry";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type BankOption = { id: string; name: string; bankName: string | null };

type TreasuryDocActionsProps = {
  kind: "receipt" | "payment-order";
  id: string;
  status: TreasuryDocStatus;
  paymentMethod?: TreasuryPaymentMethod;
  hasCashMovement?: boolean;
  hasBankMovement?: boolean;
  hasTransferPayment?: boolean;
  transferMissingBankAccount?: boolean;
  bankAccounts?: BankOption[];
};

export function TreasuryDocActions({
  kind,
  id,
  status,
  paymentMethod,
  hasCashMovement = false,
  hasBankMovement = false,
  hasTransferPayment = false,
  transferMissingBankAccount = false,
  bankAccounts = [],
}: TreasuryDocActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");

  function run(
    action: (id: string) => Promise<{
      ok: boolean;
      error?: string;
      code?: "NO_OPEN_CASH";
      currency?: string;
    }>,
    opts?: { withCashRetry?: boolean },
  ) {
    startTransition(async () => {
      const result = opts?.withCashRetry
        ? await withOpenCashRetry(() => action(id))
        : await action(id);
      if (!result.ok) {
        window.alert(result.error ?? "No se pudo completar la acción.");
        return;
      }
      router.refresh();
    });
  }

  const canSyncCash =
    status === "POSTED" &&
    !hasCashMovement &&
    (paymentMethod === "CASH" || paymentMethod === "OTHER");

  const canSyncBank =
    status === "POSTED" &&
    !hasBankMovement &&
    (hasTransferPayment || paymentMethod === "TRANSFER");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(kind === "receipt" ? issueReceipt : issuePaymentOrder)
          }
        >
          Emitir
        </Button>
      ) : null}
      {status === "DRAFT" || status === "ISSUED" ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(kind === "receipt" ? postReceipt : postPaymentOrder, {
              withCashRetry: true,
            })
          }
        >
          Imputar
        </Button>
      ) : null}
      {canSyncCash ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (
              !window.confirm(
                paymentMethod === "CASH"
                  ? "¿Registrar este documento en la caja diaria abierta?"
                  : "¿Marcarlo como efectivo y registrarlo en la caja diaria?",
              )
            ) {
              return;
            }
            startTransition(async () => {
              const result = await withOpenCashRetry(() =>
                syncPostedDocumentToCash(kind, id),
              );
              if (!result.ok) {
                window.alert(result.error ?? "No se pudo sincronizar con caja.");
                return;
              }
              router.refresh();
            });
          }}
        >
          {paymentMethod === "CASH"
            ? "Registrar en caja"
            : "Pasar a efectivo y caja"}
        </Button>
      ) : null}
      {canSyncBank ? (
        <>
          {transferMissingBankAccount && bankAccounts.length > 0 ? (
            <Select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="h-9 w-48"
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.bankName ? ` · ${b.bankName}` : ""}
                </option>
              ))}
            </Select>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  "¿Registrar las transferencias de este documento en la cuenta bancaria?",
                )
              ) {
                return;
              }
              startTransition(async () => {
                const result = await syncPostedDocumentToBank(
                  kind,
                  id,
                  transferMissingBankAccount ? bankAccountId : undefined,
                );
                if (!result.ok) {
                  window.alert(result.error ?? "No se pudo sincronizar con banco.");
                  return;
                }
                router.refresh();
              });
            }}
          >
            Registrar en banco
          </Button>
        </>
      ) : null}
      {status !== "CANCELLED" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          className="text-[var(--destructive)]"
          onClick={() => {
            if (
              !window.confirm(
                "¿Anular el documento? Si estaba imputado, se revierten los movimientos.",
              )
            ) {
              return;
            }
            run(kind === "receipt" ? cancelReceipt : cancelPaymentOrder);
          }}
        >
          Anular
        </Button>
      ) : null}
    </div>
  );
}
