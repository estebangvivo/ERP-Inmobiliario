import Link from "next/link";
import { requireModule } from "@/lib/session";
import { listContractsForTreasury } from "@/features/treasury/queries/list-contracts-for-treasury";
import {
  getEnabledCurrencies,
  getOrganizationCurrency,
} from "@/features/settings/queries/get-organization";
import { listActiveBankAccountsForPayment } from "@/features/treasury/queries/bank-queries";
import {
  listOpenOwnerSettlements,
  listOpenSupplierInvoices,
  listPayableWorkOrdersForPaymentOrder,
} from "@/features/treasury/queries/account-statements";
import { listPortfolioChecksForPayment } from "@/features/treasury/queries/list-checks";
import { listSuppliersForTreasury } from "@/features/treasury/queries/list-treasury";
import { TreasuryDocumentForm } from "@/features/treasury/components/treasury-document-form";
import { PageHeader } from "@/components/erp/page-chrome";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    invoiceId?: string;
    workOrderId?: string;
    supplierId?: string;
  }>;
};

export default async function NuevaOrdenPagoPage({ searchParams }: PageProps) {
  await requireModule("tesoreria");
  const params = await searchParams;
  const workOrderId = params.workOrderId?.trim() || undefined;
  const invoiceId = params.invoiceId?.trim() || undefined;
  const supplierIdParam = params.supplierId?.trim() || undefined;

  const [
    contracts,
    suppliers,
    currency,
    enabledCurrencies,
    bankAccounts,
    openInvoices,
    openSettlements,
    portfolioChecks,
    openWorkOrders,
  ] = await Promise.all([
    listContractsForTreasury(),
    listSuppliersForTreasury(),
    getOrganizationCurrency(),
    getEnabledCurrencies(),
    listActiveBankAccountsForPayment(),
    listOpenSupplierInvoices(
      workOrderId || supplierIdParam
        ? { workOrderId, supplierId: supplierIdParam }
        : undefined,
    ),
    listOpenOwnerSettlements(),
    listPortfolioChecksForPayment(),
    listPayableWorkOrdersForPaymentOrder(
      workOrderId || supplierIdParam
        ? { workOrderId, supplierId: supplierIdParam }
        : undefined,
    ),
  ]);

  const prefillInvoice = invoiceId
    ? openInvoices.find((i) => i.id === invoiceId) ?? null
    : null;
  const prefillWo = workOrderId
    ? openWorkOrders.find((w) => w.id === workOrderId) ?? null
    : null;

  let defaultPartyId =
    supplierIdParam ||
    prefillInvoice?.supplierId ||
    prefillWo?.supplierId ||
    "";
  if (
    defaultPartyId &&
    !suppliers.some((s) => s.id === defaultPartyId)
  ) {
    defaultPartyId = "";
  }

  const defaultContractId =
    prefillInvoice?.contractId ||
    prefillWo?.contractId ||
    "";

  const defaultAmount =
    prefillInvoice?.balance ||
    (prefillWo && prefillWo.balance > 0 ? prefillWo.balance : 0);

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
        parties={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          documentNumber: s.documentNumber,
        }))}
        defaultCurrency={currency}
        enabledCurrencies={enabledCurrencies}
        bankAccounts={bankAccounts}
        portfolioChecks={portfolioChecks}
        defaultPartyId={defaultPartyId || undefined}
        defaultContractId={defaultContractId || undefined}
        defaultAmount={defaultAmount}
        defaultConcept={
          prefillWo
            ? `Pago OT ${prefillWo.code}`
            : prefillInvoice
              ? `Pago factura ${prefillInvoice.number}`
              : ""
        }
        openDocuments={openInvoices.map((i) => ({
          id: i.id,
          label: i.label,
          balance: i.balance,
          currency: i.currency,
          contractId: i.contractId ?? undefined,
        }))}
        openWorkOrders={openWorkOrders.map((w) => ({
          id: w.id,
          label: w.label,
          balance: w.balance,
          currency: w.currency,
          contractId: w.contractId,
          supplierId: w.supplierId,
        }))}
        openSettlements={openSettlements.map((s) => ({
          id: s.id,
          label: s.label,
          balance: s.balance,
          currency: s.currency,
        }))}
        defaultDocumentApps={
          prefillInvoice
            ? [{ documentId: prefillInvoice.id, amount: prefillInvoice.balance }]
            : []
        }
        defaultWorkOrderApps={
          prefillWo && !prefillInvoice
            ? [
                {
                  documentId: prefillWo.id,
                  amount:
                    prefillWo.balance > 0 ? prefillWo.balance : defaultAmount,
                },
              ]
            : []
        }
      />
    </div>
  );
}
