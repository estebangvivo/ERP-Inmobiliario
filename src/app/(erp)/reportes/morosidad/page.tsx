import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import { DelinquencyReportView } from "@/features/reports/components/delinquency-report-view";
import { ReportToolbar } from "@/features/reports/components/report-toolbar";
import { getDelinquencyReport } from "@/features/reports/queries/delinquency-report";
import { requireModule, requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ReportesMorosidadPage() {
  await requireModule("reportes");
  await requireStaff();
  const report = await getDelinquencyReport();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Morosidad"
        description="Inquilinos con cuotas abiertas y aging de saldos."
        actions={
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Link
              href="/reportes"
              className="text-sm text-[var(--primary)] hover:underline"
            >
              ← Reportes
            </Link>
            <ReportToolbar csvHref="/api/reportes/morosidad/csv" />
          </div>
        }
      />

      <DelinquencyReportView report={report} />
    </div>
  );
}
