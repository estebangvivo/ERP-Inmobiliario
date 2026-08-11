import Link from "next/link";
import { requireModule } from "@/lib/session";
import { listContractsForTreasury } from "@/features/treasury/queries/list-contracts-for-treasury";
import { listTenantsForTreasury } from "@/features/treasury/queries/list-treasury";
import {
  getEnabledCurrencies,
  getOrganizationCurrency,
} from "@/features/settings/queries/get-organization";
import { listActiveBankAccountsForPayment } from "@/features/treasury/queries/bank-queries";
import { listOpenTenantBills } from "@/features/treasury/queries/account-statements";
import { TreasuryDocumentForm } from "@/features/treasury/components/treasury-document-form";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ contractId?: string; billId?: string }>;
};

export default async function NuevoReciboPage({ searchParams }: PageProps) {
  await requireModule("tesoreria");
  const { contractId, billId } = await searchParams;

  const [
    contracts,
    tenants,
    currency,
    enabledCurrencies,
    bankAccounts,
    openBills,
  ] = await Promise.all([
    listContractsForTreasury(),
    listTenantsForTreasury(),
    getOrganizationCurrency(),
    getEnabledCurrencies(),
    listActiveBankAccountsForPayment(),
    listOpenTenantBills(contractId ? { contractId } : undefined),
  ]);

  const defaultContractId =
    contractId && contracts.some((c) => c.id === contractId) ? contractId : "";
  const prefillBill = billId
    ? openBills.find((b) => b.id === billId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo recibo" description="Registrar un cobro." />
      <p className="text-sm">
        <Link href="/tesoreria/recibos" className="text-[var(--primary)] hover:underline">
          ← Recibos
        </Link>
      </p>
      <TreasuryDocumentForm
        kind="receipt"
        contracts={contracts}
        parties={tenants.map((t) => ({
          id: t.id,
          name: t.name,
          documentNumber: t.documentNumber,
        }))}
        defaultCurrency={currency}
        enabledCurrencies={enabledCurrencies}
        defaultContractId={defaultContractId}
        bankAccounts={bankAccounts}
        openDocuments={openBills.map((b) => ({
          id: b.id,
          label: b.label,
          balance: b.balance,
          currency: b.currency,
        }))}
        defaultDocumentApps={
          prefillBill
            ? [{ documentId: prefillBill.id, amount: prefillBill.balance }]
            : []
        }
        defaultConcept={
          prefillBill
            ? `Cobro cuota ${prefillBill.number}`
            : ""
        }
      />
    </div>
  );
}
