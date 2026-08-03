import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import { ContractEditForm } from "@/components/erp/contract-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnly, toDateInputValue } from "@/lib/dates";
import {
  ADJUSTMENT_INDEX_LABELS,
  CONTRACT_STATUS_LABELS,
  PARTY_ROLE_LABELS,
} from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";

type Params = Promise<{ id: string }>;

export default async function ContratoDetailPage({ params }: { params: Params }) {
  await requireStaff();
  const { id } = await params;

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      property: true,
      parties: { include: { user: true } },
      adjustments: { orderBy: { effectiveFrom: "asc" } },
      tenantBills: {
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        take: 6,
      },
    },
  });
  if (!contract) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={contract.code}
        description={contract.property.title}
        actions={
          <Badge variant={contract.status === "ACTIVE" ? "success" : "secondary"}>
            {CONTRACT_STATUS_LABELS[contract.status]}
          </Badge>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alquiler</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatMoney(contract.initialRent.toString(), contract.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Partes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {contract.parties.map((p) => (
              <p key={p.id}>
                <span className="text-[var(--muted-foreground)]">
                  {PARTY_ROLE_LABELS[p.role]}:{" "}
                </span>
                {p.user.name}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {contract.adjustments.map((a) => (
              <p key={a.id}>
                {ADJUSTMENT_INDEX_LABELS[a.indexType]} cada {a.periodMonths} meses
                {" · "}
                desde {formatDateOnly(a.effectiveFrom)}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <ContractEditForm
        contract={{
          id: contract.id,
          status: contract.status,
          endDate: toDateInputValue(contract.endDate),
          commissionMode: contract.commissionMode,
          commissionValue: contract.commissionValue.toString(),
          commissionTenantPct: contract.commissionTenantPct.toString(),
          commissionOwnerPct: contract.commissionOwnerPct.toString(),
          lateFeeDailyRatePct: contract.lateFeeDailyRatePct.toString(),
          includesOrdinaryExp: contract.includesOrdinaryExp,
          includesExtraordExp: contract.includesExtraordExp,
          notes: contract.notes,
        }}
      />
    </div>
  );
}
