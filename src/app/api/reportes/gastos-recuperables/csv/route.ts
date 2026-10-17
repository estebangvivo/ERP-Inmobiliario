import { formatDateOnly } from "@/lib/dates";
import { getOrganizationSession } from "@/lib/auth";
import { hasModule } from "@/features/auth/lib/modules";
import { isStaffRole } from "@/lib/session";
import { resolveReportDateRange } from "@/features/reports/lib/date-range";
import { multiSectionCsvResponse } from "@/features/reports/lib/report-csv";
import { getRecoverableExpensesReport } from "@/features/reports/queries/recoverable-expenses-report";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getOrganizationSession();
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (
    session.organizationRole !== "ADMIN" &&
    !hasModule(session.allowedModules, "reportes")
  ) {
    return Response.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (!isStaffRole(session.organizationRole)) {
    return Response.json({ error: "Solo staff" }, { status: 403 });
  }

  const url = new URL(request.url);
  const range = resolveReportDateRange(
    url.searchParams.get("desde"),
    url.searchParams.get("hasta"),
  );
  const report = await getRecoverableExpensesReport(range);

  return multiSectionCsvResponse(
    `gastos-recuperables-${range.fromInput}_${range.toInput}.csv`,
    [
      {
        title: "FACTURAS RECUPERABLES",
        headers: [
          "Fecha",
          "OT",
          "Factura",
          "Propiedad",
          "Contrato",
          "Proveedor",
          "Estado",
          "Moneda",
          "Monto",
        ],
        rows: report.invoices.map((r) => [
          formatDateOnly(r.invoiceDate),
          r.workOrderCode,
          r.invoiceNumber,
          r.propertyTitle,
          r.contractCode,
          r.supplierName,
          !r.paidToSupplier
            ? "Pendiente de pagar"
            : "Pagado · pendiente recuperar",
          r.currency,
          r.amount.toFixed(2),
        ]),
      },
      {
        title: "OT SIN FACTURA",
        headers: [
          "Código",
          "Título",
          "Propiedad",
          "Contrato",
          "Proveedor",
          "Estado",
          "Alta",
        ],
        rows: report.workOrdersWithoutInvoice.map((wo) => [
          wo.code,
          wo.title,
          wo.propertyTitle,
          wo.contractCode,
          wo.assigneeName,
          WORK_ORDER_STATUS_LABELS[
            wo.status as keyof typeof WORK_ORDER_STATUS_LABELS
          ] ?? wo.status,
          formatDateOnly(wo.requestedAt),
        ]),
      },
    ],
  );
}
