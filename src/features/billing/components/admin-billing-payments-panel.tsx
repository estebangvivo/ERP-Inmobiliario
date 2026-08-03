"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  approveBillingPayment,
  rejectBillingPayment,
} from "@/features/billing/actions/admin-billing-actions";

type BillingPaymentRow = {
  id: string;
  plan: string;
  method: string;
  currency: string;
  amount: number;
  amountUsd: number | null;
  amountArs: number | null;
  fxRateUsed: number | null;
  companyName: string | null;
  organizationName: string | null;
  transferProofUrl: string | null;
  notes: string | null;
  status: string;
  mpPaymentId: string | null;
  createdAt: string;
  userEmail: string;
  userPhone: string | null;
  userName: string;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR");
}

function formatMoney(currency: string, value: number) {
  return `${currency} ${value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function AmountCell({ p }: { p: BillingPaymentRow }) {
  const primary =
    p.currency === "ARS"
      ? p.amountArs != null
        ? formatMoney("ARS", p.amountArs)
        : formatMoney("ARS", p.amount)
      : p.amountUsd != null
        ? formatMoney("USD", p.amountUsd)
        : formatMoney(p.currency, p.amount);

  const secondary =
    p.currency === "ARS"
      ? p.amountUsd != null
        ? formatMoney("USD", p.amountUsd)
        : null
      : p.amountArs != null
        ? formatMoney("ARS", p.amountArs)
        : null;

  return (
    <div>
      <p className="font-medium">{primary}</p>
      {secondary && (
        <p className="text-xs text-[var(--muted-foreground)]">{secondary}</p>
      )}
    </div>
  );
}

function companyLabel(p: BillingPaymentRow) {
  return (p.companyName || p.organizationName || "").trim();
}

function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type StatusFilter = "ANY" | "PENDING" | "APPROVED" | "REJECTED";

function matchesFilters(
  p: BillingPaymentRow,
  filters: {
    company: string;
    user: string;
    amountMin: string;
    amountMax: string;
    amountCurrency: "ANY" | "ARS" | "USD";
    status: StatusFilter;
  },
) {
  const companyQ = filters.company.trim().toLowerCase();
  if (companyQ) {
    const hay = companyLabel(p).toLowerCase();
    if (!hay.includes(companyQ)) return false;
  }

  const userQ = filters.user.trim().toLowerCase();
  if (userQ) {
    const hay = `${p.userName} ${p.userEmail} ${p.userPhone ?? ""}`.toLowerCase();
    if (!hay.includes(userQ)) return false;
  }

  if (filters.status !== "ANY" && p.status !== filters.status) {
    return false;
  }

  const min = parseAmount(filters.amountMin);
  const max = parseAmount(filters.amountMax);
  if (min != null || max != null) {
    const value =
      filters.amountCurrency === "ARS"
        ? p.amountArs
        : filters.amountCurrency === "USD"
          ? p.amountUsd
          : p.currency === "ARS"
            ? (p.amountArs ?? p.amount)
            : (p.amountUsd ?? p.amount);

    if (value == null) return false;
    if (min != null && value < min) return false;
    if (max != null && value > max) return false;
  }

  return true;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

const METHOD_LABEL: Record<string, string> = {
  TRANSFER: "Transferencia",
  MERCADOPAGO: "Mercado Pago",
};

const fieldClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]";

export function AdminBillingPaymentsPanel({
  pendingTransfers,
  recent,
}: {
  pendingTransfers: BillingPaymentRow[];
  recent: BillingPaymentRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [company, setCompany] = useState("");
  const [user, setUser] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [amountCurrency, setAmountCurrency] = useState<"ANY" | "ARS" | "USD">(
    "ANY",
  );
  const [status, setStatus] = useState<StatusFilter>("ANY");

  const filters = {
    company,
    user,
    amountMin,
    amountMax,
    amountCurrency,
    status,
  };

  const filteredPending = useMemo(
    () => pendingTransfers.filter((p) => matchesFilters(p, filters)),
    [pendingTransfers, company, user, amountMin, amountMax, amountCurrency, status],
  );

  const filteredRecent = useMemo(
    () => recent.filter((p) => matchesFilters(p, filters)),
    [recent, company, user, amountMin, amountMax, amountCurrency, status],
  );

  const hasActiveFilters = Boolean(
    company.trim() ||
      user.trim() ||
      amountMin.trim() ||
      amountMax.trim() ||
      amountCurrency !== "ANY" ||
      status !== "ANY",
  );

  function clearFilters() {
    setCompany("");
    setUser("");
    setAmountMin("");
    setAmountMax("");
    setAmountCurrency("ANY");
    setStatus("ANY");
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        window.alert(result.error ?? "Error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-medium">Filtros</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Empresa, usuario, estado y rango de monto (USD o ARS).
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1 sm:col-span-1 lg:col-span-1">
            <Label>Empresa</Label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Nombre o razón social"
              className={fieldClass}
            />
          </div>
          <div className="space-y-1 sm:col-span-1 lg:col-span-1">
            <Label>Usuario</Label>
            <Input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="Nombre o email"
              className={fieldClass}
            />
          </div>
          <div className="space-y-1">
            <Label>Estado</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className={fieldClass}
            >
              <option value="ANY">Todos</option>
              <option value="PENDING">Pendiente</option>
              <option value="APPROVED">Aprobado</option>
              <option value="REJECTED">Rechazado</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Moneda</Label>
            <select
              value={amountCurrency}
              onChange={(e) =>
                setAmountCurrency(e.target.value as "ANY" | "ARS" | "USD")
              }
              className={fieldClass}
            >
              <option value="ANY">Del cobro</option>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Monto desde</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              placeholder="0"
              className={fieldClass}
            />
          </div>
          <div className="space-y-1">
            <Label>Monto hasta</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              placeholder="Sin tope"
              className={fieldClass}
            />
          </div>
        </div>
        {hasActiveFilters && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Mostrando {filteredPending.length} transferencia
            {filteredPending.length === 1 ? "" : "s"} pendiente
            {filteredPending.length === 1 ? "" : "s"} · {filteredRecent.length}{" "}
            en historial
            {filteredRecent.length === 1 ? "" : "es"}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-medium">Transferencias pendientes</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Comprobantes a revisar para activar o renovar empresas.
          </p>
        </div>
        {pendingTransfers.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No hay transferencias pendientes de revisión.
          </p>
        ) : filteredPending.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Ninguna transferencia pendiente coincide con los filtros.
          </p>
        ) : (
          <ul className="space-y-4">
            {filteredPending.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-[var(--border)] p-4 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {p.companyName || p.organizationName || "Renovación"} ·{" "}
                      {p.plan}
                    </p>
                    <div className="text-[var(--muted-foreground)]">
                      <p>
                        {p.userName} ({p.userEmail})
                      </p>
                      {p.userPhone ? (
                        <p className="text-xs">Cel: {p.userPhone}</p>
                      ) : (
                        <p className="text-xs text-amber-800">
                          Sin teléfono — no se podrá avisar por WhatsApp
                        </p>
                      )}
                      <AmountCell p={p} />
                      {p.fxRateUsed ? (
                        <p className="text-xs">TC {p.fxRateUsed}</p>
                      ) : null}
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatDateTime(p.createdAt)}
                    </p>
                    {p.notes && (
                      <p className="mt-1 text-[var(--muted-foreground)]">
                        {p.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => approveBillingPayment(p.id))}
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        const reason = window.prompt(
                          "Motivo del rechazo (obligatorio, se envía al usuario)",
                        );
                        if (reason == null) return;
                        if (!reason.trim()) {
                          window.alert("Tenés que indicar el motivo.");
                          return;
                        }
                        run(() => rejectBillingPayment(p.id, reason.trim()));
                      }}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>
                {p.transferProofUrl && (
                  <div className="mt-3">
                    {p.transferProofUrl.startsWith("data:application/pdf") ? (
                      <a
                        href={p.transferProofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--primary)] hover:underline"
                      >
                        Ver PDF del comprobante
                      </a>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.transferProofUrl}
                        alt="Comprobante"
                        className="max-h-64 rounded-md border border-[var(--border)] object-contain"
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-medium">Historial reciente</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Incluye Mercado Pago (aprobación automática) y transferencias.
          </p>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Todavía no hay pagos registrados.
          </p>
        ) : filteredRecent.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Ningún pago del historial coincide con los filtros.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--muted)]/50 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Empresa / plan</th>
                  <th className="px-3 py-2 font-medium">Usuario</th>
                  <th className="px-3 py-2 font-medium">Método</th>
                  <th className="px-3 py-2 font-medium">Monto</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredRecent.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2.5 text-[var(--muted-foreground)]">
                      {formatDateTime(p.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">
                        {p.companyName || p.organizationName || "—"}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {p.plan}
                      </p>
                      {p.mpPaymentId && (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          MP #{p.mpPaymentId}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p>{p.userName}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {p.userEmail}
                      </p>
                      {p.userPhone ? (
                        <a
                          href={`tel:${p.userPhone.replace(/\s+/g, "")}`}
                          className="text-xs text-[var(--primary)] hover:underline"
                        >
                          {p.userPhone}
                        </a>
                      ) : (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Sin tel.
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {METHOD_LABEL[p.method] ?? p.method}
                    </td>
                    <td className="px-3 py-2.5">
                      <AmountCell p={p} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          p.status === "APPROVED"
                            ? "text-emerald-700"
                            : p.status === "REJECTED"
                              ? "text-[var(--destructive)]"
                              : "text-amber-800"
                        }
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                      {p.method === "MERCADOPAGO" && p.status === "PENDING" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() => approveBillingPayment(p.id))
                          }
                          className="ml-2 text-xs text-[var(--primary)] underline"
                        >
                          Activar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
