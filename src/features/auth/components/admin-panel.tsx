"use client";

import { useState, useTransition } from "react";
import type { BillingPlan, BillingStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/erp/page-chrome";
import {
  clearActiveOrganization,
  createOrganization,
  switchOrganization,
} from "@/features/auth/actions/organization-actions";
import {
  listOrganizationUsers,
  type OrganizationUserRow,
} from "@/features/auth/actions/user-actions";
import {
  updateOrganizationBillingBySuperadmin,
  type AdminOrgOverview,
} from "@/features/auth/actions/admin-panel-actions";
import { UsersAdminPanel } from "@/features/auth/components/users-admin-panel";
import { BILLING_PLANS } from "@/features/billing/lib/plans";
import { publicPropertiesPath } from "@/lib/public-org";

type Tab = "empresas" | "usuarios" | "billing";

type Props = {
  organizations: AdminOrgOverview[];
};

const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  ACTIVE: "Activo",
  PAST_DUE: "Vencido",
  PENDING_PAYMENT: "Pago pendiente",
  EXEMPT: "Exento",
};

export function AdminPanel({ organizations }: Props) {
  const [tab, setTab] = useState<Tab>("empresas");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgUsers, setOrgUsers] = useState<OrganizationUserRow[]>([]);
  const [billingOrgId, setBillingOrgId] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadUsers(orgId: string) {
    setSelectedOrgId(orgId);
    setTab("usuarios");
    startTransition(async () => {
      const users = await listOrganizationUsers(orgId);
      setOrgUsers(users);
    });
  }

  function enterOrg(orgId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await switchOrganization(orgId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Recarga completa para aplicar cookie de sesión sin soft-nav colgado.
        window.location.assign("/dashboard");
      } catch (err) {
        console.error(err);
        setError("No se pudo abrir la empresa. Probá de nuevo.");
      }
    });
  }

  function exitToPlatform() {
    startTransition(async () => {
      await clearActiveOrganization();
      window.location.reload();
    });
  }

  function createExemptOrg(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createOrganization({
        name: newOrgName,
        slug: newOrgSlug || undefined,
        switchTo: false,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewOrgName("");
      setNewOrgSlug("");
      window.location.reload();
    });
  }

  function saveBilling(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateOrganizationBillingBySuperadmin({
        organizationId: String(fd.get("organizationId") ?? ""),
        billingStatus: String(
          fd.get("billingStatus") ?? "ACTIVE",
        ) as BillingStatus,
        billingPlan: (String(fd.get("billingPlan") ?? "") || null) as
          | BillingPlan
          | null,
        paidUntil: String(fd.get("paidUntil") ?? "") || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      window.location.reload();
    });
  }

  const selectedOrg = organizations.find((o) => o.id === billingOrgId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(
            [
              ["empresas", "Empresas"],
              ["usuarios", "Usuarios"],
              ["billing", "Billing"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={tab === key ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exitToPlatform} disabled={pending}>
          Modo plataforma
        </Button>
      </div>

      {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

      {tab === "empresas" && (
        <div className="space-y-6">
          <form
            onSubmit={createExemptOrg}
            className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-3"
          >
            <Input
              placeholder="Nombre nueva empresa"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              required
            />
            <Input
              placeholder="Slug (opcional)"
              value={newOrgSlug}
              onChange={(e) => setNewOrgSlug(e.target.value)}
            />
            <Button type="submit" disabled={pending}>
              Crear empresa EXEMPT
            </Button>
          </form>

          <DataTable
            headers={[
              "Empresa",
              "Slug",
              "Billing",
              "Plan",
              "Miembros",
              "Vence",
              "",
            ]}
            empty={organizations.length === 0}
          >
            {organizations.map((org) => (
              <tr key={org.id} className="hover:bg-[var(--muted)]/40">
                <td className="px-4 py-3 font-medium">{org.name}</td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">
                  {org.slug}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">
                    {BILLING_STATUS_LABELS[org.billingStatus]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm">
                  {org.billingPlan ?? "—"}
                </td>
                <td className="px-4 py-3">{org.memberCount}</td>
                <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                  {org.paidUntil
                    ? org.paidUntil.toLocaleDateString("es-AR")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <a
                      href={publicPropertiesPath(org.slug)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button size="sm" variant="ghost">
                        Portal
                      </Button>
                    </a>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => enterOrg(org.id)}
                      disabled={pending}
                    >
                      Entrar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadUsers(org.id)}
                    >
                      Usuarios
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {tab === "usuarios" && (
        <div className="space-y-4">
          {selectedOrgId ? (
            <>
              <p className="text-sm text-[var(--muted-foreground)]">
                Empresa:{" "}
                {organizations.find((o) => o.id === selectedOrgId)?.name}
              </p>
              <UsersAdminPanel users={orgUsers} organizationId={selectedOrgId} />
            </>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              Elegí una empresa desde la pestaña Empresas → Usuarios.
            </p>
          )}
        </div>
      )}

      {tab === "billing" && (
        <form
          onSubmit={saveBilling}
          className="max-w-lg space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <h3 className="font-semibold">Override de facturación</h3>
          <div className="space-y-2">
            <Label htmlFor="billingOrg">Empresa</Label>
            <Select
              id="billingOrg"
              value={billingOrgId}
              onChange={(e) => setBillingOrgId(e.target.value)}
              required
            >
              <option value="">Seleccionar…</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          {selectedOrg && (
            <>
              <input type="hidden" name="organizationId" value={selectedOrg.id} />
              <div className="space-y-2">
                <Label htmlFor="billingStatus">Estado</Label>
                <Select
                  id="billingStatus"
                  name="billingStatus"
                  defaultValue={selectedOrg.billingStatus}
                >
                  {Object.entries(BILLING_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingPlan">Plan</Label>
                <Select
                  id="billingPlan"
                  name="billingPlan"
                  defaultValue={selectedOrg.billingPlan ?? ""}
                >
                  <option value="">Sin plan</option>
                  {Object.keys(BILLING_PLANS).map((k) => (
                    <option key={k} value={k}>
                      {BILLING_PLANS[k as keyof typeof BILLING_PLANS].label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paidUntil">Válido hasta</Label>
                <Input
                  id="paidUntil"
                  name="paidUntil"
                  type="date"
                  defaultValue={
                    selectedOrg.paidUntil
                      ? selectedOrg.paidUntil.toISOString().slice(0, 10)
                      : ""
                  }
                />
              </div>
            </>
          )}
          <Button type="submit" disabled={pending || !billingOrgId}>
            Guardar billing
          </Button>
        </form>
      )}
    </div>
  );
}
