import { formatDateOnly } from "@/lib/dates";
import { getOrganizationSession } from "@/lib/auth";
import { hasModule } from "@/features/auth/lib/modules";
import { isStaffRole } from "@/lib/session";
import { reportCsvResponse } from "@/features/reports/lib/report-csv";
import { getDelinquencyReport } from "@/features/reports/queries/delinquency-report";

export const dynamic = "force-dynamic";

export async function GET() {
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

  const report = await getDelinquencyReport();

  return reportCsvResponse(
    "morosidad.csv",
    [
      "Inquilino",
      "Email",
      "Cuotas abiertas",
      "Saldo",
      "0-30",
      "31-60",
      "61-90",
      "+90",
      "Vencimiento más antiguo",
    ],
    report.rows.map((r) => [
      r.tenantName,
      r.tenantEmail,
      r.openBills,
      Object.entries(r.balanceByCurrency)
        .map(([cur, amt]) => `${cur} ${amt.toFixed(2)}`)
        .join(" / "),
      r.aging.b0_30.toFixed(2),
      r.aging.b31_60.toFixed(2),
      r.aging.b61_90.toFixed(2),
      r.aging.b90_plus.toFixed(2),
      r.oldestDueDate ? formatDateOnly(r.oldestDueDate) : "",
    ]),
  );
}
