import { listAdminOrganizationsOverview } from "@/features/auth/actions/admin-panel-actions";
import { listOrganizationUsers } from "@/features/auth/actions/user-actions";
import { AdminPanel } from "@/features/auth/components/admin-panel";
import { listAdminBillingPayments } from "@/features/billing/actions/admin-billing-actions";
import { getAdminMercadoPagoConfig } from "@/features/billing/actions/admin-mercadopago-actions";
import { getAdminPlanPrices } from "@/features/billing/actions/admin-plan-prices-actions";
import { getAdminTransferBankConfig } from "@/features/billing/actions/admin-transfer-actions";
import { listAllFeatureRequestsForAdmin } from "@/features/feature-requests/actions/feature-request-actions";
import {
  computeExpenseTotals,
  dbListPlatformExpenses,
} from "@/features/platform-expenses/lib/expense-db";
import { PageHeader } from "@/components/erp/page-chrome";
import { requireAdminPanelSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Promise<{ org?: string; tab?: string }>;
};

const VALID_TABS = [
  "users",
  "companies",
  "payments",
  "requests",
  "planPrices",
  "expenses",
  "transferBank",
  "mercadopago",
  "billing",
] as const;

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await requireAdminPanelSession();
  const params = (await searchParams) ?? {};

  const organizations = await listAdminOrganizationsOverview();
  const manageableOrgs = organizations.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
  }));

  const requestedOrgId = params.org?.trim() || "";
  const selectedOrgId =
    (requestedOrgId &&
      manageableOrgs.some((o) => o.id === requestedOrgId) &&
      requestedOrgId) ||
    session.organizationId ||
    manageableOrgs[0]?.id ||
    "";

  const [
    users,
    billingPayments,
    mercadoPagoConfig,
    transferBankConfig,
    planPrices,
    systemExpenses,
    featureRequests,
  ] = await Promise.all([
    selectedOrgId
      ? listOrganizationUsers(selectedOrgId)
      : Promise.resolve([]),
    listAdminBillingPayments(),
    getAdminMercadoPagoConfig(),
    getAdminTransferBankConfig(),
    getAdminPlanPrices(),
    dbListPlatformExpenses({})
      .then((items) => ({
        items,
        totals: computeExpenseTotals(items),
      }))
      .catch((error) => {
        console.error("admin listPlatformExpenses", error);
        return {
          items: [],
          totals: {
            totalArs: 0,
            totalUsd: 0,
            totalHours: 0,
            count: 0,
          },
        };
      }),
    listAllFeatureRequestsForAdmin(),
  ]);

  const tabParam = params.tab?.trim();
  const initialTab = VALID_TABS.includes(
    tabParam as (typeof VALID_TABS)[number],
  )
    ? (tabParam as (typeof VALID_TABS)[number])
    : undefined;

  return (
    <div>
      <PageHeader
        title="Administración"
        description={`Superadmin (${session.user.email}): usuarios, precios, gastos, mejoras, transferencias y Mercado Pago sin cambiar de sesión.`}
      />
      <AdminPanel
        organizations={organizations}
        manageableOrgs={manageableOrgs}
        users={users}
        selectedOrgId={selectedOrgId}
        billingPayments={billingPayments}
        mercadoPagoConfig={
          mercadoPagoConfig ?? {
            configured: false,
            fromEnv: false,
            tokenHint: null,
            publicKeyHint: null,
            webhookUrl: "",
            surchargePercent: 4,
          }
        }
        transferBankConfig={
          transferBankConfig ?? {
            accountName: "",
            taxId: "",
            bankNameArs: "",
            cbuArs: "",
            aliasArs: "",
            bankNameUsd: "",
            accountUsd: "",
            notes: "",
          }
        }
        planPrices={planPrices ?? []}
        systemExpenses={systemExpenses}
        featureRequests={featureRequests}
        initialTab={initialTab}
      />
    </div>
  );
}
