import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import { PublicCatalogLinkCard } from "@/components/erp/public-catalog-link-card";
import { OrganizationPlanCard } from "@/features/billing/components/organization-plan-card";
import { UsersAdminPanel } from "@/features/auth/components/users-admin-panel";
import { listOrganizationUsers } from "@/features/auth/actions/user-actions";
import { hasModule } from "@/features/auth/lib/modules";
import { OrganizationSettingsForm } from "@/features/settings/components/organization-settings-form";
import { getOrganizationProfile, getEnabledCurrencies } from "@/features/settings/queries/get-organization";
import { BanksSettingsPanel } from "@/features/settings/components/banks-settings-panel";
import { listBankAccounts } from "@/features/treasury/queries/bank-queries";
import { isStaffRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const session = await requireSession();

  if (
    session.organizationRole !== "ADMIN" &&
    !hasModule(session.allowedModules, "ajustes")
  ) {
    redirect("/dashboard");
  }

  const organization = await getOrganizationProfile();
  if (!organization) redirect("/dashboard");

  const canManageUsers =
    session.organizationRole === "ADMIN" ||
    hasModule(session.allowedModules, "usuarios");

  const [billing, users, bankAccounts, enabledCurrencies] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: {
        billingPlan: true,
        billingStatus: true,
        paidUntil: true,
      },
    }),
    canManageUsers ? listOrganizationUsers() : Promise.resolve([]),
    listBankAccounts(),
    getEnabledCurrencies(),
  ]);

  const appOrigin = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"
  ).replace(/\/$/, "");

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Inmobiliaria, monedas, identidad visual, suscripción y usuarios."
      />
      <p className="mb-8 text-sm">
        <Link
          href="/usuarios"
          className="text-[var(--primary)] hover:underline"
        >
          Ir a usuarios →
        </Link>
      </p>
      <div className="space-y-10">
        <PublicCatalogLinkCard
          orgSlug={organization.slug}
          orgName={organization.name}
          appOrigin={appOrigin}
        />
        <OrganizationSettingsForm organization={organization} />
        <BanksSettingsPanel
          accounts={bankAccounts}
          enabledCurrencies={enabledCurrencies}
          canManage={isStaffRole(session.organizationRole)}
        />
        {billing ? (
          <OrganizationPlanCard
            billingPlan={billing.billingPlan}
            billingStatus={billing.billingStatus}
            paidUntil={billing.paidUntil}
          />
        ) : null}
        {canManageUsers ? (
          <UsersAdminPanel
            users={users}
            organizationId={session.organizationId}
          />
        ) : null}
      </div>
    </div>
  );
}
