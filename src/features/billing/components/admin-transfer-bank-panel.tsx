"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAdminTransferBankConfig } from "@/features/billing/actions/admin-transfer-actions";
import type { TransferBankDetails } from "@/features/billing/lib/platform-billing-settings";

const fieldClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]";

export function AdminTransferBankPanel({
  initial,
}: {
  initial: TransferBankDetails;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function setField<K extends keyof TransferBankDetails>(
    key: K,
    value: TransferBankDetails[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    startTransition(async () => {
      const result = await saveAdminTransferBankConfig(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSave} className="max-w-xl space-y-6">
      <div>
        <h2 className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Landmark className="size-5" aria-hidden />
          Transferencia bancaria
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Alias, CBU y datos que ven los usuarios al elegir pagar por
          transferencia. Se muestran en el alta y la renovación de planes.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
        <div className="space-y-1">
          <Label>Titular</Label>
          <Input
            required
            value={form.accountName}
            onChange={(e) => setField("accountName", e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <Label>CUIT</Label>
          <Input
            required
            value={form.taxId}
            onChange={(e) => setField("taxId", e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <Label>Banco (ARS)</Label>
          <Input
            value={form.bankNameArs}
            onChange={(e) => setField("bankNameArs", e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <Label>CBU (ARS)</Label>
          <Input
            value={form.cbuArs}
            onChange={(e) => setField("cbuArs", e.target.value)}
            className={fieldClass}
            placeholder="22 dígitos"
          />
        </div>
        <div className="space-y-1">
          <Label>Alias (ARS)</Label>
          <Input
            value={form.aliasArs}
            onChange={(e) => setField("aliasArs", e.target.value)}
            className={fieldClass}
            placeholder="EMPRESA.PAGOS"
          />
        </div>
        <div className="space-y-1">
          <Label>Banco (USD)</Label>
          <Input
            value={form.bankNameUsd}
            onChange={(e) => setField("bankNameUsd", e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <Label>Cuenta USD</Label>
          <Input
            value={form.accountUsd}
            onChange={(e) => setField("accountUsd", e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <Label>Notas</Label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-[var(--destructive)]/40 bg-[var(--muted)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}
      {ok && (
        <p className="rounded-md border border-emerald-700/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Datos de transferencia guardados.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
