import { csvResponse } from "@/lib/csv";
import { formatDateOnly } from "@/lib/dates";
import { getOrganizationSession } from "@/lib/auth";
import { hasModule } from "@/features/auth/lib/modules";
import { isStaffRole } from "@/lib/session";
import { listTenantsWithDebt } from "@/server/services/tenant-ledger";

export async function GET() {
  const session = await getOrganizationSession();
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (
    session.organizationRole !== "ADMIN" &&
    !hasModule(session.allowedModules, "cobros")
  ) {
    return Response.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (!isStaffRole(session.organizationRole)) {
    return Response.json({ error: "Solo staff" }, { status: 403 });
  }

  const rows = await listTenantsWithDebt(session.organizationId);
  return csvResponse(
    "morosos.csv",
    ["Inquilino", "Email", "Cuotas abiertas", "Saldo", "Vencimiento más antiguo"],
    rows.map((r) => [
      r.tenantName,
      r.tenantEmail,
      r.openBills,
      Object.entries(r.balanceByCurrency)
        .map(([cur, amt]) => `${cur} ${amt.toFixed(2)}`)
        .join(" / "),
      r.oldestDueDate ? formatDateOnly(r.oldestDueDate) : "",
    ]),
  );
}
