import { notFound } from "next/navigation";
import { requireModule } from "@/lib/session";
import { getPaymentOrderById } from "@/features/treasury/queries/list-treasury";
import { getOrganizationProfile } from "@/features/settings/queries/get-organization";
import { organizationLogoSrc } from "@/features/settings/lib/organization-logo";
import { TreasuryPrintReport } from "@/features/treasury/components/treasury-print-report";
import { PrintReportToolbar } from "@/features/treasury/components/print-report-toolbar";
import { treasuryPdfFilename } from "@/features/treasury/lib/treasury-pdf";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoPrint?: string }>;
};

export default async function OrdenPagoPrintPage({
  params,
  searchParams,
}: PageProps) {
  await requireModule("tesoreria");
  const { id } = await params;
  const { autoPrint } = await searchParams;
  const [doc, org] = await Promise.all([
    getPaymentOrderById(id),
    getOrganizationProfile(),
  ]);
  if (!doc || !org) notFound();

  const filename = treasuryPdfFilename("payment-order", doc.number);

  return (
    <>
      <PrintReportToolbar
        backHref={`/tesoreria/ordenes-pago/${id}`}
        backLabel="Volver a la orden"
        pdfUrl={`/api/tesoreria/ordenes-pago/${id}/pdf`}
        filename={filename}
        autoPrint={autoPrint === "1"}
      />
      <TreasuryPrintReport
        data={{
          kind: "payment-order",
          number: doc.number,
          status: doc.status,
          issueDate: doc.issueDate,
          partyName: doc.supplier?.name ?? doc.partyName ?? "—",
          partyTaxId: doc.supplier?.documentNumber ?? null,
          totalAmount: Number(doc.totalAmount),
          currency: doc.currency,
          concept: doc.concept,
          notes: doc.notes,
          organizationName: org.name,
          organizationTaxId: org.taxId,
          organizationAddress: [org.address, org.city, org.province]
            .filter(Boolean)
            .join(", "),
          organizationLogoUrl: organizationLogoSrc(org.logoUrl),
          payments: doc.payments.map((p) => ({
            method: p.method,
            amount: Number(p.amount),
            checkNumber: p.checkNumber,
            checkBank: p.checkBank,
            isElectronicCheck: p.isElectronicCheck,
            bankAccountName: p.bankAccount?.name ?? null,
          })),
          lines: doc.lines.map((line) => ({
            description: line.description,
            contractLabel: line.contract?.code ?? null,
            propertyLabel: line.property?.title ?? null,
            amount: Number(line.amount),
          })),
        }}
      />
    </>
  );
}
