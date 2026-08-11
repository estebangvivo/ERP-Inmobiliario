import { csvResponse } from "@/lib/csv";
import { formatDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getOrganizationSession } from "@/lib/auth";
import { hasModule } from "@/features/auth/lib/modules";
import { isStaffRole } from "@/lib/session";
import { contractScopeWhere } from "@/lib/tenant-scope";

export async function GET() {
  const session = await getOrganizationSession();
  if (!session) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (
    session.organizationRole !== "ADMIN" &&
    !hasModule(session.allowedModules, "contratos")
  ) {
    return Response.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (!isStaffRole(session.organizationRole)) {
    return Response.json({ error: "Solo staff" }, { status: 403 });
  }

  const contracts = await prisma.contract.findMany({
    where: contractScopeWhere(session),
    select: {
      code: true,
      status: true,
      startDate: true,
      endDate: true,
      initialRent: true,
      currency: true,
      property: { select: { title: true } },
      parties: {
        select: { role: true, user: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return csvResponse(
    "contratos.csv",
    [
      "Código",
      "Propiedad",
      "Inquilino",
      "Garantes",
      "Estado",
      "Inicio",
      "Fin",
      "Alquiler",
      "Moneda",
    ],
    contracts.map((c) => [
      c.code,
      c.property.title,
      c.parties.find((p) => p.role === "TENANT")?.user.name ?? "",
      c.parties
        .filter((p) => p.role === "GUARANTOR")
        .map((p) => p.user.name)
        .join(" / "),
      c.status,
      formatDateOnly(c.startDate),
      formatDateOnly(c.endDate),
      Number(c.initialRent),
      c.currency,
    ]),
  );
}
