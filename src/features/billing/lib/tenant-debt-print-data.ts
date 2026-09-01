import { getOrganizationProfile } from "@/features/settings/queries/get-organization";
import { organizationLogoSrc } from "@/features/settings/lib/organization-logo";
import { prisma } from "@/lib/prisma";
import { getTenantDebtDetail } from "@/server/services/tenant-ledger";

export type TenantDebtPrintBill = {
  installmentLabel: string;
  kind: "RENT" | "SERVICES";
  dueDate: Date;
  status: string;
  currency: string;
  contractCode: string;
  propertyTitle: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
};

export type TenantDebtPrintData = {
  issueDate: Date;
  tenant: {
    name: string;
    email: string;
    phone: string | null;
    documentNumber: string | null;
  };
  bills: TenantDebtPrintBill[];
  balanceByCurrency: Record<string, number>;
  organizationName: string;
  organizationTaxId: string | null;
  organizationAddress: string | null;
  organizationLogoUrl: string | null;
};

export async function getTenantDebtPrintData(
  organizationId: string,
  tenantId: string,
): Promise<TenantDebtPrintData | null> {
  const [detail, org, tenantDoc] = await Promise.all([
    getTenantDebtDetail(organizationId, tenantId),
    getOrganizationProfile(),
    prisma.user.findFirst({
      where: { id: tenantId },
      select: { documentNumber: true },
    }),
  ]);

  if (!detail || !org) return null;

  return {
    issueDate: new Date(),
    tenant: {
      ...detail.tenant,
      documentNumber: tenantDoc?.documentNumber ?? null,
    },
    bills: detail.bills.map((b) => ({
      installmentLabel: b.installmentLabel,
      kind: b.kind,
      dueDate: b.dueDate,
      status: b.status,
      currency: b.currency,
      contractCode: b.contractCode,
      propertyTitle: b.propertyTitle,
      totalAmount: b.totalAmount,
      paidAmount: b.paidAmount,
      balance: b.balance,
    })),
    balanceByCurrency: detail.balanceByCurrency,
    organizationName: org.name,
    organizationTaxId: org.taxId,
    organizationAddress: [org.address, org.city, org.province]
      .filter(Boolean)
      .join(", "),
    organizationLogoUrl: organizationLogoSrc(org.logoUrl),
  };
}

export function tenantDebtPdfFilename(tenantName: string): string {
  const slug = tenantName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `deuda-${slug || "inquilino"}-${date}.pdf`;
}
