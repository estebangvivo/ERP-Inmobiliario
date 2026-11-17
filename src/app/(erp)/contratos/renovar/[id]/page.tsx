import { notFound } from "next/navigation";
import Link from "next/link";
import type { ContractServicePaidBy, ServiceCostCategory } from "@prisma/client";
import { PageHeader } from "@/components/erp/page-chrome";
import {
  ContractCreateForm,
  type ContractCreateDefaults,
} from "@/components/erp/contract-form";
import type { ContractServiceDraft } from "@/components/erp/contract-services-fields";
import { Button } from "@/components/ui/button";
import { formatDateOnly, toDateInputValue } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { contractScopeWhere, propertyScopeWhere } from "@/lib/tenant-scope";
import { getCurrentRent } from "@/server/services/billing";
import { listOrgPeople } from "@/server/queries/org-people";
import type { CommissionModeValue } from "@/features/contracts/lib/commission";

type Params = Promise<{ id: string }>;

function addUtcDays(d: Date, days: number) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days),
  );
}

export default async function RenovarContratoPage({
  params,
}: {
  params: Params;
}) {
  const session = await requireStaff();
  const orgId = session.organizationId;
  const { id } = await params;

  const contract = await prisma.contract.findFirst({
    where: {
      id,
      AND: [contractScopeWhere(session)],
      status: { in: ["ACTIVE", "EXPIRED"] },
    },
    include: {
      property: {
        select: {
          id: true,
          title: true,
          address: true,
          city: true,
          price: true,
          rentPrice: true,
          currency: true,
          rentCurrency: true,
          ownerships: {
            orderBy: [{ isPrimary: "desc" }, { sharePct: "desc" }],
            take: 1,
            include: { owner: { select: { id: true, name: true } } },
          },
        },
      },
      parties: {
        include: { user: { select: { id: true, name: true, documentNumber: true } } },
      },
      adjustments: { orderBy: { effectiveFrom: "desc" }, take: 1 },
      contractServices: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { concept: "asc" }],
      },
    },
  });

  if (!contract) notFound();

  const currentRent = await getCurrentRent(contract.id);
  const owner = contract.parties.find((p) => p.role === "OWNER")?.user;
  const tenant = contract.parties.find((p) => p.role === "TENANT")?.user;
  const guarantorsOnContract = contract.parties.filter(
    (p) => p.role === "GUARANTOR",
  );
  const lastAdj = contract.adjustments[0];

  const durationMs =
    contract.endDate.getTime() - contract.startDate.getTime();
  const suggestedStart = addUtcDays(contract.endDate, 1);
  const suggestedEnd = new Date(suggestedStart.getTime() + durationMs);

  const serviceDrafts: ContractServiceDraft[] =
    contract.contractServices.map((s, i) => ({
      key: `renew-svc-${i}-${s.id}`,
      category: s.category as ServiceCostCategory,
      concept: s.concept,
      amount: s.amount.toString(),
      paidBy: s.paidBy as ContractServicePaidBy,
      providerContractNumber: s.providerContractNumber ?? "",
      meterNumber: s.meterNumber ?? "",
      enabled: true,
      isCustom: true,
    }));

  const defaults: ContractCreateDefaults = {
    renewFromContractId: contract.id,
    renewFromCode: contract.code,
    propertyId: contract.propertyId,
    ownerId: owner?.id ?? "",
    tenantId: tenant?.id ?? "",
    guarantorIds: guarantorsOnContract.map((g) => g.userId),
    startDate: toDateInputValue(suggestedStart),
    endDate: toDateInputValue(suggestedEnd),
    initialRent: String(currentRent),
    currency: contract.currency,
    depositAmount: contract.depositAmount.toString(),
    lateFeeDailyRatePct: contract.lateFeeDailyRatePct.toString(),
    indexType: lastAdj?.indexType ?? "MAX_ICL_IPC_CP",
    periodMonths: String(lastAdj?.periodMonths ?? 3),
    notes: contract.notes
      ? `${contract.notes}\n\nRenovación de ${contract.code}.`
      : `Renovación de ${contract.code}.`,
    includesOrdinaryExp: contract.includesOrdinaryExp,
    includesExtraordExp: contract.includesExtraordExp,
    commissionMode: contract.commissionMode as CommissionModeValue,
    commissionValue: contract.commissionValue.toString(),
    commissionTenantPct: contract.commissionTenantPct.toString(),
    commissionOwnerPct: contract.commissionOwnerPct.toString(),
    commissionInstallments:
      contract.commissionInstallments != null
        ? String(contract.commissionInstallments)
        : "1",
    services: serviceDrafts,
  };

  const [properties, owners, tenants, guarantors] = await Promise.all([
    prisma.property.findMany({
      where: {
        AND: [
          propertyScopeWhere(session),
          {
            OR: [
              { id: contract.propertyId },
              {
                AND: [
                  { operationType: { in: ["RENT", "BOTH"] } },
                  { status: { in: ["AVAILABLE", "RESERVED", "RENTED"] } },
                ],
              },
            ],
          },
        ],
      },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        address: true,
        city: true,
        price: true,
        rentPrice: true,
        currency: true,
        rentCurrency: true,
        ownerships: {
          orderBy: [{ isPrimary: "desc" }, { sharePct: "desc" }],
          take: 1,
          include: { owner: { select: { id: true, name: true } } },
        },
      },
    }),
    listOrgPeople(orgId, ["OWNER"]),
    listOrgPeople(orgId, ["TENANT"]),
    listOrgPeople(orgId, ["GUARANTOR", "OWNER", "TENANT", "VIEWER", "AGENT"]),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Renovar ${contract.code}`}
        description={`Se crea un contrato nuevo a partir del vigente (fin ${formatDateOnly(contract.endDate)}). Podés editar todos los datos antes de guardar. El anterior pasará a Renovado.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/contratos/${contract.id}`}>
              <Button variant="outline">Ver original</Button>
            </Link>
            <Link href="/contratos/por-vencer">
              <Button variant="outline">Próximos a vencer</Button>
            </Link>
          </div>
        }
      />
      <ContractCreateForm
        properties={properties.map((p) => {
          const primary = p.ownerships[0];
          return {
            id: p.id,
            title: p.title,
            address: p.address,
            city: p.city,
            price: (p.rentPrice ?? p.price)?.toString() ?? null,
            currency: p.rentCurrency ?? p.currency,
            ownerId: primary?.owner.id ?? null,
            ownerName: primary?.owner.name ?? null,
          };
        })}
        owners={owners}
        tenants={tenants}
        guarantors={guarantors}
        defaults={defaults}
      />
    </div>
  );
}
