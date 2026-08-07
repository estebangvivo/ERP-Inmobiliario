import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/session";
import { listContractsForTreasury } from "@/features/treasury/queries/list-contracts-for-treasury";
import {
  getEnabledCurrencies,
  getOrganizationCurrency,
} from "@/features/settings/queries/get-organization";
import { listActiveBankAccountsForPayment } from "@/features/treasury/queries/bank-queries";
import { listOpenOwnerSettlements, listOpenSupplierInvoices } from "@/features/treasury/queries/account-statements";
import { listPortfolioChecksForPayment } from "@/features/treasury/queries/list-checks";
import { listSuppliersForTreasury } from "@/features/treasury/queries/list-treasury";
import { TreasuryDocumentForm } from "@/features/treasury/components/treasury-document-form";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

export default async function NuevaOrdenPagoPage() {
  await requireModule("tesoreria");

  const [
    contracts,
    suppliers,
    currency,
    enabledCurrencies,
    bankAccounts,
    openInvoices,
    openSettlements,
    portfolioChecks,
  ] = await Promise.all([
    listContractsForTreasury(),
    listSuppliersForTreasury(),
    getOrganizationCurrency(),
    getEnabledCurrencies(),
    listActiveBankAccountsForPayment(),
    listOpenSupplierInvoices(),
    listOpenOwnerSettlements(),
    listPortfolioChecksForPayment(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Nueva orden de pago" description="Registrar un pago." />
      <p className="text-sm">
        <Link
          href="/tesoreria/ordenes-pago"
          className="text-[var(--primary)] hover:underline"
        >
          ← Órdenes de pago
        </Link>
      </p>
      <TreasuryDocumentForm
        kind="payment-order"
        contracts={contracts}
        parties={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        defaultCurrency={currency}
        enabledCurrencies={enabledCurrencies}
        bankAccounts={bankAccounts}
        portfolioChecks={portfolioChecks}
        openDocuments={openInvoices.map((i) => ({
          id: i.id,
          label: i.label,
          balance: i.balance,
          currency: i.currency,
        }))}
        openSettlements={openSettlements.map((s) => ({
          id: s.id,
          label: s.label,
          balance: s.balance,
          currency: s.currency,
        }))}
      />
    </div>
  );
}
