import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import { RecoverableExpensesView } from "@/features/reports/components/recoverable-expenses-view";
import { ReportDateRangeForm } from "@/features/reports/components/report-date-range-form";
import { ReportToolbar } from "@/features/reports/components/report-toolbar";
import { resolveReportDateRange } from "@/features/reports/lib/date-range";
import { getRecoverableExpensesReport } from "@/features/reports/queries/recoverable-expenses-report";
import { formatDateOnly } from "@/lib/dates";
import { requireModule, requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ desde?: string; hasta?: string }>;

export default async function ReportesGastosRecuperablesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireModule("reportes");
  await requireStaff();
  const params = await searchParams;
  const range = resolveReportDateRange(params.desde, params.hasta);
  const report = await getRecoverableExpensesReport(range);

  const csvQs = new URLSearchParams({
    desde: range.fromInput,
    hasta: range.toInput,
  }).toString();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gastos a recuperar"
        description={`Período ${formatDateOnly(range.from)} – ${formatDateOnly(range.to)}`}
        actions={
          <Link
            href="/reportes"
            className="text-sm text-[var(--primary)] hover:underline print:hidden"
          >
            ← Reportes
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReportDateRangeForm
          basePath="/reportes/gastos-recuperables"
          fromInput={range.fromInput}
          toInput={range.toInput}
        />
        <ReportToolbar
          csvHref={`/api/reportes/gastos-recuperables/csv?${csvQs}`}
        />
      </div>

      <RecoverableExpensesView report={report} />
    </div>
  );
}
