"use server";

import { prisma } from "@/lib/prisma";
import { normalizeDni } from "@/lib/dni";
import { requireStaff } from "@/lib/session";

export type GuarantorActiveContract = {
  id: string;
  code: string;
  status: string;
  startDate: string;
  endDate: string;
  propertyTitle: string;
  tenantName: string | null;
  initialRent: string;
  currency: string;
};

export type FindGuarantorContractsResult =
  | { ok: true; personName: string; contracts: GuarantorActiveContract[] }
  | { ok: false; error: string };

/**
 * Contratos ACTIVE de la org donde la persona (por userId / DNI) ya figura como garante.
 */
export async function findActiveGuarantorContractsAction(
  userId: string,
  excludeContractId?: string | null,
): Promise<FindGuarantorContractsResult> {
  const session = await requireStaff();
  const trimmed = userId.trim();
  if (!trimmed) {
    return { ok: false, error: "Persona inválida." };
  }

  const user = await prisma.user.findUnique({
    where: { id: trimmed },
    select: { id: true, name: true, documentNumber: true },
  });
  if (!user) {
    return { ok: false, error: "Persona no encontrada." };
  }

  const relatedUserIds = new Set<string>([user.id]);
  const dni = normalizeDni(user.documentNumber ?? "");
  if (dni) {
    const members = await prisma.organizationMember.findMany({
      where: {
        organizationId: session.organizationId,
        user: { documentNumber: { not: null } },
      },
      select: {
        user: { select: { id: true, documentNumber: true } },
      },
    });
    for (const m of members) {
      if (normalizeDni(m.user.documentNumber ?? "") === dni) {
        relatedUserIds.add(m.user.id);
      }
    }
  }

  const parties = await prisma.contractParty.findMany({
    where: {
      userId: { in: [...relatedUserIds] },
      role: "GUARANTOR",
      contract: {
        organizationId: session.organizationId,
        status: "ACTIVE",
        ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
      },
    },
    select: {
      contract: {
        select: {
          id: true,
          code: true,
          status: true,
          startDate: true,
          endDate: true,
          initialRent: true,
          currency: true,
          property: { select: { title: true } },
          parties: {
            where: { role: "TENANT" },
            select: { user: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: { contract: { startDate: "desc" } },
  });

  const seen = new Set<string>();
  const contracts: GuarantorActiveContract[] = [];
  for (const p of parties) {
    if (seen.has(p.contract.id)) continue;
    seen.add(p.contract.id);
    contracts.push({
      id: p.contract.id,
      code: p.contract.code,
      status: p.contract.status,
      startDate: p.contract.startDate.toISOString(),
      endDate: p.contract.endDate.toISOString(),
      propertyTitle: p.contract.property.title,
      tenantName: p.contract.parties[0]?.user.name ?? null,
      initialRent: String(p.contract.initialRent),
      currency: p.contract.currency,
    });
  }

  return {
    ok: true,
    personName: user.name,
    contracts,
  };
}
