"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@prisma/client";
import {
  findActiveGuarantorContractsAction,
  type GuarantorActiveContract,
} from "@/server/actions/guarantor-contracts";

type Props = {
  open: boolean;
  personName: string;
  contracts: GuarantorActiveContract[];
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function GuarantorDuplicateModal({
  open,
  personName,
  contracts,
  pending = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guarantor-dup-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2
              id="guarantor-dup-title"
              className="text-lg font-semibold tracking-tight"
            >
              Garante ya cargado en otro contrato
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              <span className="font-medium text-[var(--foreground)]">
                {personName}
              </span>{" "}
              ya figura como garante en{" "}
              {contracts.length === 1
                ? "un contrato activo"
                : `${contracts.length} contratos activos`}
              . ¿Querés cargarlo de todas formas en este contrato?
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-3">
          {contracts.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-amber-200/80 bg-amber-500/5 px-3 py-3 dark:border-amber-900/50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/contratos/${c.id}`}
                  className="text-sm font-semibold text-[var(--primary)] hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.code}
                </Link>
                <Badge variant="success">Activo</Badge>
              </div>
              <p className="mt-1 text-sm font-medium">{c.propertyTitle}</p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                {c.tenantName ? `Inquilino: ${c.tenantName} · ` : ""}
                {formatDateOnly(c.startDate)} — {formatDateOnly(c.endDate)}
                {" · "}
                Alquiler{" "}
                {formatMoney(c.initialRent, c.currency as Currency)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
          >
            No, elegir otro
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? "Confirmando…" : "Sí, cargar de todas formas"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useGuarantorDuplicateCheck(excludeContractId?: string | null) {
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{
    userId: string;
    personName: string;
    contracts: GuarantorActiveContract[];
    onConfirm: () => void;
  } | null>(null);

  function requestSelect(
    userId: string,
    onAccepted: (acked: boolean) => void,
  ) {
    if (!userId) {
      onAccepted(false);
      return;
    }

    startTransition(async () => {
      const result = await findActiveGuarantorContractsAction(
        userId,
        excludeContractId,
      );
      if (!result.ok) {
        onAccepted(false);
        return;
      }
      if (result.contracts.length === 0) {
        onAccepted(false);
        return;
      }
      setDialog({
        userId,
        personName: result.personName,
        contracts: result.contracts,
        onConfirm: () => {
          setDialog(null);
          onAccepted(true);
        },
      });
    });
  }

  function cancelDialog() {
    setDialog(null);
  }

  const modal = (
    <GuarantorDuplicateModal
      open={dialog != null}
      personName={dialog?.personName ?? ""}
      contracts={dialog?.contracts ?? []}
      pending={pending}
      onConfirm={() => dialog?.onConfirm()}
      onCancel={cancelDialog}
    />
  );

  return { requestSelect, modal, checking: pending && dialog == null };
}
