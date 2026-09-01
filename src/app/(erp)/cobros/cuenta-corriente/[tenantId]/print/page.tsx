import { notFound, redirect } from "next/navigation";
import { TenantDebtPrintReport } from "@/features/billing/components/tenant-debt-print-report";
import {
  getTenantDebtPrintData,
  tenantDebtPdfFilename,
} from "@/features/billing/lib/tenant-debt-print-data";
import { PrintReportToolbar } from "@/features/treasury/components/print-report-toolbar";
import { requireModule, isStaffRole } from "@/lib/session";
import { syncOverdueBills } from "@/server/services/billing";

type PageProps = {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ autoPrint?: string }>;
};

export default async function CuentaCorrientePrintPage({
  params,
  searchParams,
}: PageProps) {
  const session = await requireModule("cobros");
  if (!isStaffRole(session.organizationRole)) {
    redirect("/cobros");
  }

  const { tenantId } = await params;
  const { autoPrint } = await searchParams;

  await syncOverdueBills(session.organizationId);
  const data = await getTenantDebtPrintData(
    session.organizationId,
    tenantId,
  );
  if (!data) notFound();

  const backHref = `/cobros/cuenta-corriente/${tenantId}`;
  const filename = tenantDebtPdfFilename(data.tenant.name);

  return (
    <>
      <PrintReportToolbar
        backHref={backHref}
        backLabel="Volver a la cuenta corriente"
        pdfUrl={`/api/cobros/cuenta-corriente/${tenantId}/pdf`}
        filename={filename}
        autoPrint={autoPrint === "1"}
      />
      <TenantDebtPrintReport data={data} />
    </>
  );
}
