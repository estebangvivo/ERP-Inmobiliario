import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getOrganizationSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/features/auth/lib/modules";
import { settlementScopeWhere } from "@/lib/tenant-scope";
import { SettlementPdfDocument } from "@/components/pdf/settlement-pdf";

type Params = Promise<{ id: string }>;

export async function GET(
  _request: Request,
  { params }: { params: Params },
) {
  const session = await getOrganizationSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.organizationRole !== "ADMIN" &&
    !hasModule(session.allowedModules, "rendiciones")
  ) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const settlement = await prisma.ownerSettlement.findFirst({
    where: { id, AND: [settlementScopeWhere(session)] },
    include: {
      owner: true,
      lines: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!settlement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    SettlementPdfDocument({
      data: {
        code: settlement.code,
        ownerName: settlement.owner.name,
        ownerEmail: settlement.owner.email,
        periodMonth: settlement.periodMonth,
        periodYear: settlement.periodYear,
        currency: settlement.currency,
        grossRent: settlement.grossRent.toString(),
        commissionAmount: settlement.commissionAmount.toString(),
        deductionsAmount: settlement.deductionsAmount.toString(),
        extraordinaryAmount: settlement.extraordinaryAmount.toString(),
        netPayout: settlement.netPayout.toString(),
        bankAlias: settlement.owner.bankAlias,
        bankCbu: settlement.owner.bankCbu,
        lines: settlement.lines.map((l) => ({
          concept: l.concept,
          amount: l.amount.toString(),
          negative: Number(l.amount) < 0,
        })),
      },
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${settlement.code}.pdf"`,
    },
  });
}
