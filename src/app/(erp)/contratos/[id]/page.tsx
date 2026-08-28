import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import {
  ContractEditForm,
  ContractGuarantorsForm,
} from "@/components/erp/contract-form";
import { ContractAttachmentsManager } from "@/components/erp/contract-attachments";
import { ApplyAdjustmentForm } from "@/components/erp/apply-adjustment-form";
import { DepositCard } from "@/components/erp/deposit-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnly, toDateInputValue } from "@/lib/dates";
import {
  ADJUSTMENT_INDEX_LABELS,
  BILL_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  PARTY_ROLE_LABELS,
} from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { contractScopeWhere } from "@/lib/tenant-scope";
import { getCurrentRent } from "@/server/services/billing";
import { hasModule } from "@/features/auth/lib/modules";
import { PersonNameLink } from "@/components/erp/history-sections";
import { listOrgPeople } from "@/server/queries/org-people";
import { ContractServicesPanel } from "@/components/erp/contract-services-panel";
import { TENANT_BILL_KIND_LABELS } from "@/features/billing/lib/tenant-bill-kind";

type Params = Promise<{ id: string }>;

export default async function ContratoDetailPage({ params }: { params: Params }) {
  const session = await requireModule("contratos");
  const staff = isStaffRole(session.organizationRole);
  const canSeeBills = hasModule(session.allowedModules, "cobros");
  const { id } = await params;

  const contract = await prisma.contract.findFirst({
    where: { id, AND: [contractScopeWhere(session)] },
    include: {
      property: true,
      parties: { include: { user: true } },
      attachments: { orderBy: { createdAt: "desc" } },
      adjustments: { orderBy: { effectiveFrom: "asc" } },
      contractServices: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { concept: "asc" }],
      },
      tenantBills: {
        orderBy: [
          { periodYear: "desc" },
          { periodMonth: "desc" },
          { kind: "asc" },
        ],
        take: 12,
      },
    },
  });
  if (!contract) notFound();

  const guarantorParties = contract.parties.filter((p) => p.role === "GUARANTOR");
  const catalogGuarantors = staff
    ? await listOrgPeople(session.organizationId, [
        "GUARANTOR",
        "OWNER",
        "TENANT",
        "VIEWER",
        "AGENT",
      ])
    : [];
  const guarantorOptions = [
    ...catalogGuarantors,
    ...guarantorParties.map((p) => ({
      id: p.user.id,
      name: p.user.name,
      documentNumber: p.user.documentNumber,
    })),
  ].filter(
    (person, index, all) => all.findIndex((p) => p.id === person.id) === index,
  );

  const currentRent = await getCurrentRent(contract.id);
  const currentRentLabel = formatMoney(String(currentRent), contract.currency);
  const closedWithDeposit =
    (contract.status === "TERMINATED" || contract.status === "EXPIRED") &&
    contract.depositHeld;

  const openBills = await prisma.tenantBill.findMany({
    where: {
      contractId: contract.id,
      kind: "SERVICES",
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
    },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      dueDate: true,
      status: true,
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={contract.code}
        description={`${contract.property.title} · Vigencia ${formatDateOnly(contract.startDate)} – ${formatDateOnly(contract.endDate)}`}
        actions={
          <Badge variant={contract.status === "ACTIVE" ? "success" : "secondary"}>
            {CONTRACT_STATUS_LABELS[contract.status]}
          </Badge>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alquiler vigente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{currentRentLabel}</p>
            {currentRent !== Number(contract.initialRent) ? (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Inicial:{" "}
                {formatMoney(contract.initialRent.toString(), contract.currency)}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Partes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contract.parties.map((p) => (
              <div key={p.id} className="space-y-1">
                <p>
                  <span className="text-[var(--muted-foreground)]">
                    {PARTY_ROLE_LABELS[p.role]}:{" "}
                  </span>
                  <PersonNameLink id={p.user.id} name={p.user.name} />
                </p>
                {p.role === "GUARANTOR" && p.duplicateGuarantorAck ? (
                  <p className="rounded-md border border-amber-200/80 bg-amber-500/10 px-2 py-1 text-xs text-amber-950 dark:border-amber-900/50 dark:text-amber-100">
                    Se cargó sabiendo que ya era garante en otro contrato
                    activo.
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Política de ajustes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {contract.adjustments.length === 0 ? (
              <p className="text-[var(--muted-foreground)]">Sin política.</p>
            ) : (
              contract.adjustments.map((a) => (
                <p key={a.id}>
                  {ADJUSTMENT_INDEX_LABELS[a.indexType]} cada {a.periodMonths}{" "}
                  meses
                  {" · "}
                  desde {formatDateOnly(a.effectiveFrom)}
                  {a.appliedRent != null
                    ? ` · ${formatMoney(a.appliedRent.toString(), contract.currency)}`
                    : ""}
                  {a.customPercent != null ? ` (${Number(a.customPercent)}%)` : ""}
                </p>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {staff ? (
        <DepositCard
          contractId={contract.id}
          depositAmount={contract.depositAmount.toString()}
          depositHeld={contract.depositHeld}
          currency={contract.currency}
          warnOnClose={closedWithDeposit}
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Depósito / garantía</CardTitle>
            <Badge variant={contract.depositHeld ? "warning" : "secondary"}>
              {contract.depositHeld ? "En custodia" : "Devuelto / aplicado"}
            </Badge>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatMoney(contract.depositAmount.toString(), contract.currency)}
          </CardContent>
        </Card>
      )}

      {staff ? (
        <ContractServicesPanel
          contractId={contract.id}
          currency={contract.currency}
          services={contract.contractServices.map((s) => ({
            id: s.id,
            category: s.category,
            concept: s.concept,
            amount: s.amount.toString(),
            paidBy: s.paidBy,
          }))}
          openBills={openBills}
          contractStartYear={contract.startDate.getUTCFullYear()}
          contractStartMonth={contract.startDate.getUTCMonth() + 1}
        />
      ) : null}

      {contract.tenantBills.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas cuotas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contract.tenantBills.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0"
              >
                <div>
                  <p className="font-medium">
                    {TENANT_BILL_KIND_LABELS[b.kind]} {b.periodMonth}/
                    {b.periodYear} · {BILL_STATUS_LABELS[b.status]}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Vence {formatDateOnly(b.dueDate)} · Pagado{" "}
                    {formatMoney(b.paidAmount.toString(), b.currency)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {formatMoney(b.totalAmount.toString(), b.currency)}
                  </span>
                  {canSeeBills ? (
                    <Link href={`/cobros/${b.id}`}>
                      <Button size="sm" variant="outline">
                        Ver
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {staff && contract.status === "ACTIVE" ? (
        <ApplyAdjustmentForm
          contractId={contract.id}
          currentRentLabel={currentRentLabel}
        />
      ) : null}

      {staff ? (
        <ContractGuarantorsForm
          contractId={contract.id}
          initialIds={guarantorParties.map((p) => p.userId)}
          initialAcknowledgedIds={guarantorParties
            .filter((p) => p.duplicateGuarantorAck)
            .map((p) => p.userId)}
          guarantors={guarantorOptions}
        />
      ) : null}

      {staff ? (
        <ContractAttachmentsManager
          contractId={contract.id}
          attachments={contract.attachments.map((a) => ({
            id: a.id,
            kind: a.kind,
            fileName: a.fileName,
            url: a.url,
            sizeBytes: a.sizeBytes,
            createdAt: a.createdAt.toISOString(),
          }))}
        />
      ) : contract.attachments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Archivos del contrato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contract.attachments.map((a) => (
              <p key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  {a.fileName}
                </a>
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {staff ? (
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
      ) : null}
    </div>
  );
}
