"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TreasuryPaymentMethod, TreasuryDocStatus } from "@prisma/client";
import {
  cancelPaymentOrder,
  cancelReceipt,
  issuePaymentOrder,
  issueReceipt,
  postPaymentOrder,
  postReceipt,
  syncPostedDocumentToCash,
} from "@/features/treasury/actions/treasury-actions";
import { withOpenCashRetry } from "@/features/treasury/lib/with-open-cash-retry";
import { Button } from "@/components/ui/button";

type TreasuryDocActionsProps = {
  kind: "receipt" | "payment-order";
  id: string;
  status: TreasuryDocStatus;
  paymentMethod?: TreasuryPaymentMethod;
  hasCashMovement?: boolean;
};

export function TreasuryDocActions({
  kind,
  id,
  status,
  paymentMethod,
  hasCashMovement = false,
}: TreasuryDocActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
    (paymentMethod === "CASH" ||
      paymentMethod === "TRANSFER" ||
      paymentMethod === "OTHER");

  return (
    <div className="flex flex-wrap gap-2">
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
