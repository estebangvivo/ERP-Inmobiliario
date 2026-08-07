import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";

export type TreasuryContractOption = {
  id: string;
  code: string;
  propertyTitle: string;
  propertyId: string;
  tenantId: string | null;
  supplierIds: string[];
};

export async function listContractsForTreasury(): Promise<TreasuryContractOption[]> {
  const session = await requireStaff();

  const rows = await prisma.contract.findMany({
    where: {
      organizationId: session.organizationId,
      status: { in: ["ACTIVE", "RENEWED"] },
    },
    select: {
      id: true,
      code: true,
      propertyId: true,
      property: { select: { title: true } },
      parties: {
        where: { role: "TENANT" },
        select: { userId: true },
        take: 1,
      },
      workOrders: {
        where: { assigneeId: { not: null } },
        select: { assigneeId: true },
        distinct: ["assigneeId"],
      },
    },
    orderBy: { code: "asc" },
    take: 300,
  });

  return rows.map((c) => ({
    id: c.id,
    code: c.code,
    propertyTitle: c.property.title,
    propertyId: c.propertyId,
    tenantId: c.parties[0]?.userId ?? null,
    supplierIds: [
      ...new Set(
        c.workOrders
          .map((w) => w.assigneeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ],
  }));
}

/** @deprecated alias */
export const listProjectsForTreasury = listContractsForTreasury;
