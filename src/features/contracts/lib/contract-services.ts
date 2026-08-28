import type {
  ContractService,
  ContractServicePaidBy,
  TenantBillContractServiceLine,
} from "@prisma/client";
import { SERVICE_COST_CATEGORY_LABELS } from "@/lib/labels";

export const CONTRACT_SERVICE_PRESETS = [
  { category: "ELECTRICITY" as const, concept: "Luz" },
  { category: "WATER" as const, concept: "Agua" },
  { category: "GAS" as const, concept: "Gas" },
  { category: "MUNICIPAL" as const, concept: "Tasas municipales" },
] as const;

export const CONTRACT_SERVICE_PAID_BY_LABELS: Record<
  ContractServicePaidBy,
  string
> = {
  TENANT: "Inquilino",
  OWNER: "Propietario",
};

export type ContractServiceInput = {
  category: ContractService["category"];
  concept: string;
  amount: number;
  paidBy: ContractServicePaidBy;
  active?: boolean;
};

export type ResolvedContractServiceLine = {
  contractServiceId: string;
  concept: string;
  category: ContractService["category"];
  amount: number;
  paidBy: ContractServicePaidBy;
  isOverride: boolean;
};

export function defaultConceptForCategory(
  category: ContractService["category"],
): string {
  return SERVICE_COST_CATEGORY_LABELS[category] ?? category;
}

export function resolveBillContractServiceLines(
  services: ContractService[],
  billLines: TenantBillContractServiceLine[],
): ResolvedContractServiceLine[] {
  const lineMap = new Map(billLines.map((line) => [line.contractServiceId, line]));

  if (billLines.length > 0) {
    return billLines
      .map((line) => {
        const service = services.find((s) => s.id === line.contractServiceId);
        const templateAmount = service ? Number(service.amount) : Number(line.amount);
        const templatePaidBy = service?.paidBy ?? line.paidBy;
        const isOverride =
          Boolean(service) &&
          (Math.abs(Number(line.amount) - templateAmount) > 0.001 ||
            line.paidBy !== templatePaidBy);
        return {
          contractServiceId: line.contractServiceId,
          concept: line.concept,
          category: service?.category ?? "OTHER",
          amount: Number(line.amount),
          paidBy: line.paidBy,
          isOverride,
        };
      })
      .sort((a, b) => a.concept.localeCompare(b.concept));
  }

  return services
    .filter((s) => s.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.concept.localeCompare(b.concept))
    .map((service) => ({
      contractServiceId: service.id,
      concept: service.concept,
      category: service.category,
      amount: Number(service.amount),
      paidBy: service.paidBy,
      isOverride: false,
    }));
}

export function sumTenantContractServices(
  lines: ResolvedContractServiceLine[],
): number {
  return Math.round(
    lines
      .filter((l) => l.paidBy === "TENANT")
      .reduce((sum, l) => sum + l.amount, 0) * 100,
  ) / 100;
}
