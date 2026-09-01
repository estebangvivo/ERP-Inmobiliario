import { buildBillDebtPrintLines } from "@/features/billing/lib/bill-debt-concepts";
import { getOrganizationProfile } from "@/features/settings/queries/get-organization";
import { organizationLogoSrc } from "@/features/settings/lib/organization-logo";
import { prisma } from "@/lib/prisma";
import { getUnitServiceExpenseLines } from "@/server/services/billing";
import { getBillContractServiceLinesForDisplay } from "@/server/services/contract-services-billing";
import { getTenantDebtDetail } from "@/server/services/tenant-ledger";

export type TenantDebtPrintLine = {
  label: string;
  amount: number;
};

export type TenantDebtPrintBill = {
  id: string;
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
  lines: TenantDebtPrintLine[];
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

  const bills: TenantDebtPrintBill[] = [];

  for (const bill of detail.bills) {
    const [contractServiceLines, unitServiceLines] = await Promise.all([
      bill.kind === "SERVICES"
        ? getBillContractServiceLinesForDisplay(bill.id)
        : Promise.resolve([]),
      bill.unitId
        ? getUnitServiceExpenseLines(
            bill.unitId,
            bill.periodYear,
            bill.periodMonth,
          )
        : Promise.resolve([]),
    ]);

    const lines = buildBillDebtPrintLines(bill, {
      contractServiceLines: contractServiceLines.map((line) => ({
        concept: line.concept,
        amount: Number(line.amount),
      })),
      unitServiceLines,
    });

    bills.push({
      id: bill.id,
      installmentLabel: bill.installmentLabel,
      kind: bill.kind,
      dueDate: bill.dueDate,
      status: bill.status,
      currency: bill.currency,
      contractCode: bill.contractCode,
      propertyTitle: bill.propertyTitle,
      totalAmount: bill.totalAmount,
      paidAmount: bill.paidAmount,
      balance: bill.balance,
      lines,
    });
  }

  return {
    issueDate: new Date(),
    tenant: {
      ...detail.tenant,
      documentNumber: tenantDoc?.documentNumber ?? null,
    },
    bills,
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
