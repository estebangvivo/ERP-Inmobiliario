import { notFound, redirect } from "next/navigation";
import { TenantLedgerDetail } from "@/components/erp/tenant-ledger-detail";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { syncOverdueBills } from "@/server/services/billing";
import { getTenantDebtDetail } from "@/server/services/tenant-ledger";

type Params = Promise<{ tenantId: string }>;

export default async function TesoreriaCuentaInquilinoPage({
  params,
}: {
  params: Params;
}) {
  const session = await requireModule("tesoreria");
  if (!isStaffRole(session.organizationRole)) {
    redirect("/tesoreria");
  }

  const { tenantId } = await params;
  await syncOverdueBills(session.organizationId);

  const detail = await getTenantDebtDetail(
    session.organizationId,
    tenantId,
  );
  if (!detail) notFound();

  const bankRows = await prisma.bankAccount.findMany({
    where: { organizationId: session.organizationId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, bankName: true, currency: true },
  });
  const bankAccounts = bankRows.map((b) => ({
    id: b.id,
    currency: b.currency,
    label: `${b.name} · ${b.bankName} (${b.currency})`,
  }));

  return (
    <TenantLedgerDetail
      detail={detail}
      bankAccounts={bankAccounts}
      printHref={`/tesoreria/cuentas/inquilinos/${detail.tenant.id}/print`}
      backHref="/tesoreria/cuentas"
    />
  );
}
