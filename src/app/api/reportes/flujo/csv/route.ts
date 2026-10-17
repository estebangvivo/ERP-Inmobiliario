import { formatDateOnly } from "@/lib/dates";
import { getOrganizationSession } from "@/lib/auth";
import { hasModule } from "@/features/auth/lib/modules";
import { isStaffRole } from "@/lib/session";
import { resolveReportDateRange } from "@/features/reports/lib/date-range";
import { multiSectionCsvResponse } from "@/features/reports/lib/report-csv";
import { getCashFlowReport } from "@/features/reports/queries/cash-flow-report";
import { BILL_STATUS_LABELS } from "@/lib/labels";

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
  const report = await getCashFlowReport(range);

  return multiSectionCsvResponse(
    `flujo-${range.fromInput}_${range.toInput}.csv`,
    [
      {
        title: "MOVIMIENTOS",
        headers: [
          "Fecha",
          "Canal",
          "Tipo",
          "Cuenta",
          "Descripción",
          "Moneda",
          "Monto",
        ],
        rows: report.movements.map((m) => [
          formatDateOnly(m.occurredAt),
          m.channel === "CASH" ? "Caja" : "Banco",
          m.type === "INCOME" ? "Ingreso" : "Egreso",
          m.accountLabel,
          m.description,
          m.currency,
          m.amount.toFixed(2),
        ]),
      },
      {
        title: "PENDIENTE A COBRAR",
        headers: [
          "Inquilino",
          "Contrato",
          "Propiedad",
          "Cuota",
          "Vence",
          "Estado",
          "Moneda",
          "Saldo",
        ],
        rows: report.pendingCollect.map((r) => [
          r.tenantName,
          r.contractCode,
          r.propertyTitle,
          r.installmentLabel,
          formatDateOnly(r.dueDate),
          BILL_STATUS_LABELS[r.status as keyof typeof BILL_STATUS_LABELS] ??
            r.status,
          r.currency,
          r.balance.toFixed(2),
        ]),
      },
      {
        title: "PENDIENTE A PAGAR — LIQUIDACIONES",
        headers: ["Código", "Propietario", "Período", "Moneda", "Saldo"],
        rows: report.pendingSettlements.map((r) => [
          r.code,
          r.ownerName,
          r.periodLabel,
          r.currency,
          r.balance.toFixed(2),
        ]),
      },
      {
        title: "PENDIENTE A PAGAR — PROVEEDORES",
        headers: ["OT", "Factura", "Proveedor", "Moneda", "Saldo"],
        rows: report.pendingInvoices.map((r) => [
          r.workOrderCode,
          r.label,
          r.supplierName,
          r.currency,
          r.balance.toFixed(2),
        ]),
      },
    ],
  );
}
