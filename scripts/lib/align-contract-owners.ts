import type { PrismaClient } from "@prisma/client";

/**
 * Alinea el party OWNER de cada contrato activo con el titular de la propiedad.
 * Las rendiciones usan PropertyOwnership, no ContractParty.
 */
export async function alignContractPropertyOwners(
  prisma: PrismaClient,
  organizationId?: string,
) {
  const contracts = await prisma.contract.findMany({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "DRAFT"] },
    },
    select: {
      id: true,
      code: true,
      property: {
        select: {
          ownerships: {
            orderBy: [{ isPrimary: "desc" }, { sharePct: "desc" }],
            take: 1,
            select: { ownerId: true },
          },
        },
      },
      parties: {
        where: { role: "OWNER" },
        select: { id: true, userId: true },
      },
    },
  });

  let updated = 0;
  for (const contract of contracts) {
    const primaryOwnerId = contract.property.ownerships[0]?.ownerId;
    if (!primaryOwnerId) continue;

    const ownerParty = contract.parties[0];
    if (ownerParty?.userId === primaryOwnerId) continue;

    if (ownerParty) {
      await prisma.contractParty.update({
        where: { id: ownerParty.id },
        data: { userId: primaryOwnerId, sharePct: 100 },
      });
    } else {
      await prisma.contractParty.create({
        data: {
          contractId: contract.id,
          userId: primaryOwnerId,
          role: "OWNER",
          sharePct: 100,
        },
      });
    }
    updated += 1;
  }

  return updated;
}
