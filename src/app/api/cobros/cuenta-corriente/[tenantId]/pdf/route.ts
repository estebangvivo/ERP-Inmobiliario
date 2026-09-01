import { NextResponse } from "next/server";
import { buildTenantDebtPdf } from "@/features/billing/lib/tenant-debt-pdf";
import {
  getTenantDebtPrintData,
  tenantDebtPdfFilename,
} from "@/features/billing/lib/tenant-debt-print-data";
import { getOrganizationProfile } from "@/features/settings/queries/get-organization";
import { hasModule } from "@/features/auth/lib/modules";
import { getOrganizationSession } from "@/lib/auth";
import { syncOverdueBills } from "@/server/services/billing";

type Params = Promise<{ tenantId: string }>;

export async function GET(
  _request: Request,
  { params }: { params: Params },
) {
  const session = await getOrganizationSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (
    session.organizationRole !== "ADMIN" &&
    !hasModule(session.allowedModules, "cobros") &&
    !hasModule(session.allowedModules, "tesoreria")
  ) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { tenantId } = await params;
  await syncOverdueBills(session.organizationId);

  const [data, org] = await Promise.all([
    getTenantDebtPrintData(session.organizationId, tenantId),
    getOrganizationProfile(),
  ]);

  if (!data || !org) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const bytes = await buildTenantDebtPdf(data, org.logoUrl);
  const filename = tenantDebtPdfFilename(data.tenant.name);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
