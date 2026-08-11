import { csvResponse } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { getOrganizationSession } from "@/lib/auth";
import { hasModule } from "@/features/auth/lib/modules";
import { isStaffRole } from "@/lib/session";
import { settlementScopeWhere } from "@/lib/tenant-scope";

export async function GET() {
  const session = await getOrganizationSession();
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (
    session.organizationRole !== "ADMIN" &&
    !hasModule(session.allowedModules, "rendiciones")
  ) {
    return Response.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (!isStaffRole(session.organizationRole)) {
    return Response.json({ error: "Solo staff" }, { status: 403 });
  }

  const settlements = await prisma.ownerSettlement.findMany({
    where: settlementScopeWhere(session),
    include: { owner: { select: { name: true } } },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });

  return csvResponse(
    "rendiciones.csv",
    [
      "Código",
      "Propietario",
      "Período",
      "Bruto",
      "Honorarios",
      "Deducciones",
      "Neto",
      "Moneda",
      "Estado",
    ],
    settlements.map((s) => [
      s.code,
      s.owner.name,
      `${s.periodMonth}/${s.periodYear}`,
      Number(s.grossRent),
      Number(s.commissionAmount),
      Number(s.deductionsAmount),
      Number(s.netPayout),
      s.currency,
      s.status,
    ]),
  );
}
