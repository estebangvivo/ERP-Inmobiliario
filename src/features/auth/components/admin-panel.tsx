"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BillingPlan, BillingStatus } from "@prisma/client";
import {
  Building2,
  Users,
  Banknote,
  CreditCard,
  Lightbulb,
  DollarSign,
  Landmark,
  Wallet,
  Settings2,
  Circle,
} from "lucide-react";
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
  updateOrganizationBillingBySuperadmin,
  type AdminOrgOverview,
  type AdminOrganizationOverview,
} from "@/features/auth/actions/admin-panel-actions";
import {
  AdminSuperadminOrgsPanel,
} from "@/features/auth/components/admin-superadmin-orgs-panel";
import {
  type OrganizationUserRow,
} from "@/features/auth/actions/user-actions";
import { UsersAdminPanel } from "@/features/auth/components/users-admin-panel";
import { AdminBillingPaymentsPanel } from "@/features/billing/components/admin-billing-payments-panel";
import { AdminMercadoPagoPanel } from "@/features/billing/components/admin-mercadopago-panel";
import { AdminPlanPricesPanel } from "@/features/billing/components/admin-plan-prices-panel";
import { AdminTransferBankPanel } from "@/features/billing/components/admin-transfer-bank-panel";
import type { AdminPlanPriceRow } from "@/features/billing/actions/admin-plan-prices-actions";
import type {
  MercadoPagoConfigPublic,
  TransferBankDetails,
} from "@/features/billing/lib/platform-billing-settings";
import { BILLING_PLANS } from "@/features/billing/lib/plans";
import { AdminFeatureRequestsPanel } from "@/features/feature-requests/components/admin-feature-requests-panel";
import type { FeatureRequestListItem } from "@/features/feature-requests/components/feature-request-list";
import { isFeatureRequestActive } from "@/features/feature-requests/lib/labels";
import { AdminSystemExpensesPanel } from "@/features/platform-expenses/components/admin-system-expenses-panel";
import type { PlatformExpenseListResult } from "@/features/platform-expenses/actions/platform-expense-actions";
import { publicPropertiesPath } from "@/lib/public-org";
import { cn } from "@/lib/utils";

type TabId =
  | "connected"
  | "users"
  | "companies"
  | "payments"
  | "requests"
  | "planPrices"
  | "expenses"
  | "transferBank"
  | "mercadopago"
  | "billing";

type ManageableOrg = { id: string; name: string; slug: string };

type Props = {
  organizations: AdminOrgOverview[];
  presenceOverview: AdminOrganizationOverview[];
  manageableOrgs: ManageableOrg[];
  users: OrganizationUserRow[];
  selectedOrgId: string;
  billingPayments: {
    pendingTransfers: React.ComponentProps<
      typeof AdminBillingPaymentsPanel
    >["pendingTransfers"];
    recent: React.ComponentProps<typeof AdminBillingPaymentsPanel>["recent"];
  };
  mercadoPagoConfig: MercadoPagoConfigPublic;
  transferBankConfig: TransferBankDetails;
  planPrices: AdminPlanPriceRow[];
  systemExpenses: PlatformExpenseListResult;
  featureRequests: Array<
    FeatureRequestListItem & {
      organizationName: string;
      createdByName: string;
      createdByEmail: string;
    }
  >;
  initialTab?: TabId;
};

const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  ACTIVE: "Activo",
  PAST_DUE: "Vencido",
  PENDING_PAYMENT: "Pago pendiente",
  EXEMPT: "Exento",
};

export function AdminPanel({
  organizations,
  presenceOverview,
  manageableOrgs,
  users,
  selectedOrgId: initialSelectedOrgId,
  billingPayments,
  mercadoPagoConfig,
  transferBankConfig,
  planPrices,
  systemExpenses,
  featureRequests,
  initialTab,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(initialTab ?? "connected");
  const [selectedOrgId, setSelectedOrgId] = useState(
    () => initialSelectedOrgId || manageableOrgs[0]?.id || "",
  );
  const [billingOrgId, setBillingOrgId] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeFeatureRequests = useMemo(
    () => featureRequests.filter((r) => isFeatureRequestActive(r.status)).length,
    [featureRequests],
  );

  const totalOnline = presenceOverview.reduce((s, o) => s + o.onlineCount, 0);
  const totalMembers = presenceOverview.reduce((s, o) => s + o.memberCount, 0);

  const tabs: { id: TabId; label: string; icon: typeof Users }[] = [
    { id: "connected", label: "Usuarios conectados", icon: Circle },
    { id: "users", label: "Alta y permisos", icon: Users },
    { id: "companies", label: "Empresas", icon: Building2 },
    { id: "payments", label: "Pagos", icon: Banknote },
    {
      id: "requests",
      label:
        activeFeatureRequests > 0
          ? `Mejoras (${activeFeatureRequests})`
          : "Mejoras",
      icon: Lightbulb,
    },
    { id: "planPrices", label: "Precios", icon: DollarSign },
    { id: "expenses", label: "Gastos", icon: Wallet },
    { id: "transferBank", label: "Transferencia", icon: Landmark },
    { id: "mercadopago", label: "Mercado Pago", icon: CreditCard },
    { id: "billing", label: "Billing override", icon: Settings2 },
  ];

  function goTab(next: TabId, orgId = selectedOrgId) {
    setTab(next);
    const params = new URLSearchParams();
    if (orgId) params.set("org", orgId);
    params.set("tab", next);
    router.replace(`/admin?${params.toString()}`, { scroll: false });
  }

  function selectUsersOrganization(orgId: string) {
    setSelectedOrgId(orgId);
    const params = new URLSearchParams();
    params.set("org", orgId);
    params.set("tab", "users");
    router.push(`/admin?${params.toString()}`);
    setTab("users");
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

  const selectedBillingOrg = organizations.find((o) => o.id === billingOrgId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => goTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
                )}
              >
                <Icon className="size-4" />
                {t.label}
              </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exitToPlatform}
          disabled={pending}
        >
          Modo plataforma
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      ) : null}

      {tab === "connected" && (
        <section className="space-y-6">
          <div className="flex flex-wrap gap-4 text-sm text-[var(--muted-foreground)]">
            <p>
              <span className="font-medium text-[var(--foreground)]">
                {presenceOverview.length}
              </span>{" "}
              empresas (plataforma)
            </p>
            <p>
              <span className="font-medium text-[var(--foreground)]">
                {totalMembers}
              </span>{" "}
              usuarios
            </p>
            <p className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="font-medium text-[var(--foreground)]">
                {totalOnline}
              </span>{" "}
              conectados ahora
            </p>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            “Habilitado” es la cuenta; “Conectado ahora” indica presencia en
            los últimos 2 minutos.
          </p>
          <AdminSuperadminOrgsPanel overview={presenceOverview} />
        </section>
      )}

      {tab === "users" && (
        <section className="space-y-4">
          <label className="block max-w-md text-sm">
            <span className="mb-1 block text-[var(--muted-foreground)]">
              Empresa
            </span>
            <Select
              value={selectedOrgId}
              disabled={manageableOrgs.length === 0}
              onChange={(e) => selectUsersOrganization(e.target.value)}
            >
              {manageableOrgs.length === 0 ? (
                <option value="">No hay empresas</option>
              ) : (
                manageableOrgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.slug})
                  </option>
                ))
              )}
            </Select>
          </label>
          {!selectedOrgId ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No hay empresas para gestionar usuarios.
            </p>
          ) : (
            <UsersAdminPanel
              key={selectedOrgId}
              users={users}
              organizationId={selectedOrgId}
            />
          )}
        </section>
      )}

      {tab === "companies" && (
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
                <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                  {org.paidUntil
                    ? new Date(org.paidUntil).toLocaleDateString("es-AR")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <a
                      href={publicPropertiesPath(org.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[var(--primary)] underline"
                    >
                      Portal
                    </a>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => enterOrg(org.id)}
                    >
                      Entrar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => selectUsersOrganization(org.id)}
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

      {tab === "payments" && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Pagos</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Transferencias a revisar e historial de Mercado Pago y
              transferencias.
            </p>
          </div>
          <AdminBillingPaymentsPanel
            pendingTransfers={billingPayments.pendingTransfers}
            recent={billingPayments.recent}
          />
        </section>
      )}

      {tab === "requests" && (
        <AdminFeatureRequestsPanel requests={featureRequests} />
      )}

      {tab === "planPrices" && (
        <AdminPlanPricesPanel initialRows={planPrices} />
      )}

      {tab === "expenses" && (
        <AdminSystemExpensesPanel initial={systemExpenses} />
      )}

      {tab === "transferBank" && (
        <AdminTransferBankPanel initial={transferBankConfig} />
      )}

      {tab === "mercadopago" && (
        <AdminMercadoPagoPanel config={mercadoPagoConfig} />
      )}

      {tab === "billing" && (
        <form
          onSubmit={saveBilling}
          className="max-w-xl space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <div className="space-y-1">
            <Label>Empresa</Label>
            <Select
              name="organizationId"
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
          <div className="space-y-1">
            <Label>Estado billing</Label>
            <Select
              name="billingStatus"
              defaultValue={selectedBillingOrg?.billingStatus ?? "ACTIVE"}
              key={`st-${billingOrgId}`}
            >
              {(Object.keys(BILLING_STATUS_LABELS) as BillingStatus[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {BILLING_STATUS_LABELS[s]}
                  </option>
                ),
              )}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Plan</Label>
            <Select
              name="billingPlan"
              defaultValue={selectedBillingOrg?.billingPlan ?? ""}
              key={`pl-${billingOrgId}`}
            >
              <option value="">Sin plan</option>
              {Object.values(BILLING_PLANS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Vence (paidUntil)</Label>
            <Input
              type="date"
              name="paidUntil"
              key={`pu-${billingOrgId}`}
              defaultValue={
                selectedBillingOrg?.paidUntil
                  ? new Date(selectedBillingOrg.paidUntil)
                      .toISOString()
                      .slice(0, 10)
                  : ""
              }
            />
          </div>
          <Button type="submit" disabled={pending || !billingOrgId}>
            Guardar billing
          </Button>
        </form>
      )}
    </div>
  );
}
