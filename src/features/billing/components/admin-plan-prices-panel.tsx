"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import {
  saveAdminPlanPrices,
  type AdminPlanPriceRow,
} from "@/features/billing/actions/admin-plan-prices-actions";

const fieldClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]";

type RowState = {
  id: string;
  label: string;
  isTrial: boolean;
  priceUsd: string;
  priceArs: string;
  discountPercent: string;
  discountUntil: string;
  discountPromoMonths: string;
  defaultPriceUsd: number;
  defaultPriceArs: number | null;
};

function toState(rows: AdminPlanPriceRow[]): RowState[] {
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    isTrial: r.isTrial,
    priceUsd: String(r.priceUsd),
    priceArs: r.priceArs != null ? String(r.priceArs) : "",
    discountPercent:
      r.discountPercent != null ? String(r.discountPercent) : "",
    discountUntil: r.discountUntil ?? "",
    discountPromoMonths:
      r.discountPromoMonths != null ? String(r.discountPromoMonths) : "",
    defaultPriceUsd: r.defaultPriceUsd,
    defaultPriceArs: r.defaultPriceArs,
  }));
}

export function AdminPlanPricesPanel({
  initialRows,
}: {
  initialRows: AdminPlanPriceRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(() => toState(initialRows));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function updateRow(
    id: string,
    patch: Partial<
      Pick<
        RowState,
        | "priceUsd"
        | "priceArs"
        | "discountPercent"
        | "discountUntil"
        | "discountPromoMonths"
      >
    >,
  ) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    startTransition(async () => {
      const prices = rows.map((r) => {
        const priceUsd = Number(r.priceUsd.replace(",", "."));
        const arsRaw = r.priceArs.trim();
        const priceArs =
          arsRaw === "" ? null : Number(arsRaw.replace(",", "."));
        const discRaw = r.discountPercent.trim();
        const discountPercent =
          discRaw === "" ? null : Number(discRaw.replace(",", "."));
        const discountUntil = r.discountUntil.trim() || null;
        const monthsRaw = r.discountPromoMonths.trim();
        const discountPromoMonths =
          monthsRaw === "" ? null : Number(monthsRaw.replace(",", "."));
        return {
          id: r.id,
          priceUsd,
          priceArs,
          discountPercent,
          discountUntil,
          discountPromoMonths,
        };
      });
      const result = await saveAdminPlanPrices({ prices });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOk(true);
      router.refresh();
    });
  }

  function onResetDefaults() {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        priceUsd: String(r.defaultPriceUsd),
        priceArs:
          r.defaultPriceArs != null ? String(r.defaultPriceArs) : "",
        discountPercent: "",
        discountUntil: "",
        discountPromoMonths: "",
      })),
    );
    setOk(false);
    setError(null);
  }

  return (
    <form onSubmit={onSave} className="max-w-6xl space-y-6">
      <div>
        <h2 className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight">
          <DollarSign className="size-5" aria-hidden />
          Precios de planes
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Descuento % + fecha límite para contratar + meses de duración en
          planes mensuales. Solo aplica a empresas nuevas (alta / primera
          contratación). Exentas y clientes que ya pagaron un plan no reciben
          la campaña. Quien contrate antes de la fecha goza ese % durante N
          meses; después renueva al precio de lista.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">USD</th>
              <th className="px-3 py-2 font-medium">ARS (opcional)</th>
              <th className="px-3 py-2 font-medium">Desc. %</th>
              <th className="px-3 py-2 font-medium">Contratar hasta</th>
              <th className="px-3 py-2 font-medium">Meses promo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-3">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {r.id}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={r.priceUsd}
                    onChange={(e) =>
                      updateRow(r.id, { priceUsd: e.target.value })
                    }
                    className={fieldClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={r.isTrial ? "ej. 1" : "—"}
                    value={r.priceArs}
                    onChange={(e) =>
                      updateRow(r.id, { priceArs: e.target.value })
                    }
                    className={fieldClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    placeholder="—"
                    value={r.discountPercent}
                    onChange={(e) =>
                      updateRow(r.id, { discountPercent: e.target.value })
                    }
                    className={fieldClass}
                  />
                </td>
                <td className="px-3 py-3">
                  <DateInput
                    value={r.discountUntil}
                    onChange={(iso) =>
                      updateRow(r.id, { discountUntil: iso })
                    }
                  />
                </td>
                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min={1}
                    max={36}
                    step={1}
                    placeholder="ej. 6"
                    value={r.discountPromoMonths}
                    onChange={(e) =>
                      updateRow(r.id, {
                        discountPromoMonths: e.target.value,
                      })
                    }
                    className={fieldClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-[var(--destructive)]/40 bg-[var(--muted)] px-3 py-2 text-sm text-[var(--destructive)]"
        >
          {error}
        </p>
      )}
      {ok && (
        <p className="rounded-md border border-emerald-700/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Precios y descuentos guardados.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar precios"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onResetDefaults}
        >
          Restaurar valores por defecto
        </Button>
      </div>
    </form>
  );
}
