import { getOrganizationProfile } from "@/features/settings/queries/get-organization";
import { loadOrganizationLogoBytes } from "@/features/settings/lib/organization-logo-server";
import {
  getPaymentOrderById,
  getReceiptById,
} from "@/features/treasury/queries/list-treasury";
import {
  buildTreasuryDocPdf,
  treasuryPdfFilename,
  type TreasuryPdfInput,
} from "@/features/treasury/lib/treasury-pdf";

function orgAddress(org: {
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
}): string | null {
  const parts = [
    org.address,
    [org.postalCode, org.city].filter(Boolean).join(" "),
    org.province,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function baseOrgFields(org: NonNullable<Awaited<ReturnType<typeof getOrganizationProfile>>>) {
  return {
    organizationName: org.name,
    organizationTaxId: org.taxId,
    organizationAddress: orgAddress(org),
  };
}

export async function buildReceiptPdfResponse(id: string): Promise<Response> {
  const [doc, org] = await Promise.all([
    getReceiptById(id),
    getOrganizationProfile(),
  ]);
  if (!doc || !org) {
    return new Response("No encontrado", { status: 404 });
  }

  const payments =
    doc.payments.length > 0
      ? doc.payments.map((p) => ({
          method: p.method,
          amount: Number(p.amount),
          checkNumber: p.checkNumber,
          checkBank: p.checkBank,
          isElectronicCheck: p.isElectronicCheck,
          bankAccountName: p.bankAccount?.name ?? null,
        }))
      : [
          {
            method: doc.paymentMethod,
            amount: Number(doc.totalAmount),
            checkNumber: doc.checkNumber,
            checkBank: doc.checkBank,
            isElectronicCheck: false,
            bankAccountName: null,
          },
        ];

  const logo = await loadOrganizationLogoBytes(org.logoUrl);

  const input: TreasuryPdfInput = {
    kind: "receipt",
    number: doc.number,
    status: doc.status,
    issueDate: doc.issueDate,
    partyName: doc.tenant?.name ?? doc.partyName ?? "—",
    partyTaxId: doc.tenant?.documentNumber ?? null,
    totalAmount: Number(doc.totalAmount),
    currency: doc.currency,
    concept: doc.concept,
    notes: doc.notes,
    ...baseOrgFields(org),
    organizationLogo: logo,
    payments,
    lines: doc.lines.map((line) => ({
      description: line.description,
      contractLabel: line.contract ? line.contract.code : null,
      propertyLabel: line.property?.title ?? null,
      amount: Number(line.amount),
    })),
  };

  const bytes = await buildTreasuryDocPdf(input);
  const filename = treasuryPdfFilename("receipt", doc.number);
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function buildPaymentOrderPdfResponse(
  id: string,
): Promise<Response> {
  const [doc, org] = await Promise.all([
    getPaymentOrderById(id),
    getOrganizationProfile(),
  ]);
  if (!doc || !org) {
    return new Response("No encontrado", { status: 404 });
  }

  const payments =
    doc.payments.length > 0
      ? doc.payments.map((p) => ({
          method: p.method,
          amount: Number(p.amount),
          checkNumber: p.checkNumber,
          checkBank: p.checkBank,
          isElectronicCheck: p.isElectronicCheck,
          bankAccountName: p.bankAccount?.name ?? null,
        }))
      : [
          {
            method: doc.paymentMethod,
            amount: Number(doc.totalAmount),
            checkNumber: doc.checkNumber,
            checkBank: doc.checkBank,
            isElectronicCheck: false,
            bankAccountName: null,
          },
        ];

  const logo = await loadOrganizationLogoBytes(org.logoUrl);

  const input: TreasuryPdfInput = {
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
    ...baseOrgFields(org),
    organizationLogo: logo,
    payments,
    lines: doc.lines.map((line) => ({
      description: line.description,
      contractLabel: line.contract ? line.contract.code : null,
      propertyLabel: line.property?.title ?? null,
      amount: Number(line.amount),
    })),
  };

  const bytes = await buildTreasuryDocPdf(input);
  const filename = treasuryPdfFilename("payment-order", doc.number);
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
