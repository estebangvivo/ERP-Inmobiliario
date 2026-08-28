"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BillingPlan, BillingStatus, OrganizationRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateOrganizationBillingBySuperadmin,
  type AdminOrganizationOverview,
} from "@/features/auth/actions/admin-panel-actions";
import { switchOrganization } from "@/features/auth/actions/organization-actions";
import {
  BILLING_PLANS,
  normalizeBillingPlanId,
} from "@/features/billing/lib/plans";
import { ROLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { formatPresenceLabel } from "@/features/auth/lib/presence";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Activa" },
  { value: "PAST_DUE", label: "Vencida" },
  { value: "PENDING_PAYMENT", label: "Pago pendiente" },
  { value: "EXEMPT", label: "Exenta (sin cobro)" },
] as const;

const PLAN_OPTIONS = [
  { value: "NONE", label: "Sin plan" },
  ...Object.values(BILLING_PLANS).map((p) => ({
    value: p.id,
    label: p.label,
  })),
];

const fieldClass =
  "rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]";

function formatPaidUntil(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR");
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function planLabel(plan: string | null): string {
  const id = normalizeBillingPlanId(plan);
  if (!id) return plan ?? "—";
  return BILLING_PLANS[id].label;
}

type AdminSuperadminOrgsPanelProps = {
  overview: AdminOrganizationOverview[];
};

export function AdminSuperadminOrgsPanel({
  overview,
}: AdminSuperadminOrgsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BillingStatus>("ACTIVE");
  const [plan, setPlan] = useState<BillingPlan | "NONE">("NONE");
  const [paidUntil, setPaidUntil] = useState("");

  function openErp(organizationId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await switchOrganization(organizationId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.location.assign("/dashboard");
      } catch (err) {
        console.error(err);
        setError("No se pudo abrir la empresa. Probá de nuevo.");
      }
    });
  }

  function startEdit(org: AdminOrganizationOverview) {
    setEditingId(org.id);
    setError(null);
    setStatus(org.billingStatus);
    setPlan(org.billingPlan ?? "NONE");
    setPaidUntil(toDateInputValue(org.paidUntil));
  }

  function save(organizationId: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateOrganizationBillingBySuperadmin({
        organizationId,
        billingStatus: status,
        billingPlan: plan === "NONE" ? null : plan,
        paidUntil: paidUntil || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  if (overview.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No hay empresas registradas.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted-foreground)]">
        Vista de plataforma: todas las empresas, usuarios y plan. Podés abrir el
        ERP de cualquiera (aunque el plan esté vencido), y cambiar estado, plan y
        vigencia.
      </p>
      {error && (
        <p className="rounded-md border border-[var(--destructive)]/40 bg-[var(--muted)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}

      {overview.map((org) => {
        const editing = editingId === org.id;
        return (
          <div
            key={org.id}
            className="overflow-hidden rounded-lg border border-[var(--border)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--muted)]/50 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {org.name}
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {org.slug}
                </p>
                {!editing && (
                  <p className="mt-2 text-sm">
                    <span className="text-[var(--muted-foreground)]">Plan:</span>{" "}
                    {planLabel(org.billingPlan)}
                    {" · "}
                    <span className="text-[var(--muted-foreground)]">
                      Estado:
                    </span>{" "}
                    {org.billingStatus}
                    {" · "}
                    <span className="text-[var(--muted-foreground)]">
                      Hasta:
                    </span>{" "}
                    {formatPaidUntil(org.paidUntil)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-[var(--muted-foreground)]">
                  {org.onlineCount}/{org.memberCount} conectados
                </p>
                {!editing ? (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => openErp(org.id)}
                    >
                      Abrir ERP
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(org)}
                    >
                      Editar plan
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => save(org.id)}
                    >
                      {pending ? "Guardando…" : "Guardar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </Button>
                  </>
                )}
              </div>
            </div>

            {editing && (
              <div className="flex flex-wrap gap-3 border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
                <label className="text-sm">
                  <span className="mb-1 block text-[var(--muted-foreground)]">
                    Estado
                  </span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as BillingStatus)}
                    className={fieldClass}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-[var(--muted-foreground)]">
                    Plan
                  </span>
                  <select
                    value={plan}
                    onChange={(e) =>
                      setPlan(e.target.value as BillingPlan | "NONE")
                    }
                    className={fieldClass}
                  >
                    {PLAN_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-[var(--muted-foreground)]">
                    Vigente hasta
                  </span>
                  <Input
                    type="date"
                    value={paidUntil}
                    onChange={(e) => setPaidUntil(e.target.value)}
                    className="w-full"
                  />
                </label>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-4 py-2 font-medium">Usuario</th>
                    <th className="px-4 py-2 font-medium">Rol</th>
                    <th className="px-4 py-2 font-medium">Cuenta</th>
                    <th className="px-4 py-2 font-medium">Conexión</th>
                    <th className="px-4 py-2 font-medium">Módulos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {org.members.map((m) => (
                    <tr key={m.membershipId}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.name || m.email}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {m.email}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {ROLE_LABELS[m.role as OrganizationRole]}
                      </td>
                      <td className="px-4 py-3">
                        {m.isActive ? (
                          <span className="text-[var(--muted-foreground)]">
                            Habilitado
                          </span>
                        ) : (
                          <span className="text-[var(--destructive)]">
                            Deshabilitado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              m.isOnline && m.isActive
                                ? "bg-emerald-500"
                                : "bg-[var(--muted-foreground)]/40",
                            )}
                          />
                          {formatPresenceLabel(
                            m.lastSeenAt,
                            m.isOnline && m.isActive,
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {m.allowedModules.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Badge compacto de plan para la vista normal de admin. */
export function OrgBillingBadge({
  billingStatus,
  billingPlan,
  paidUntil,
}: {
  billingStatus: string;
  billingPlan: string | null;
  paidUntil: string | null;
}) {
  return (
    <p className={cn("text-xs text-[var(--muted-foreground)]")}>
      {planLabel(billingPlan)} · {billingStatus}
      {paidUntil ? ` · hasta ${formatPaidUntil(paidUntil)}` : ""}
    </p>
  );
}
