import type { OrganizationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidDni, normalizeDni } from "@/lib/dni";
import { ROLE_LABELS } from "@/lib/labels";

export type OrgDniMatch = {
  userId: string;
  name: string;
  documentNumber: string;
  role: OrganizationRole;
  roleLabel: string;
};

export type OrgDniLookupResult =
  | { ok: true; dni: string; match: null }
  | { ok: true; dni: string; match: OrgDniMatch }
  | { ok: false; error: string };

/** Busca si el DNI ya pertenece a algún miembro de la organización. */
export async function lookupOrgMemberByDni(
  organizationId: string,
  rawDni: string,
  excludeUserId?: string,
): Promise<OrgDniLookupResult> {
  const dni = normalizeDni(rawDni);
  if (!isValidDni(dni)) {
    return {
      ok: false,
      error: "DNI inválido. Usá entre 7 y 11 dígitos.",
    };
  }

  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      user: { documentNumber: { not: null } },
    },
    select: {
      role: true,
      user: {
        select: { id: true, name: true, documentNumber: true },
      },
    },
  });

  const clash = members.find(
    (m) => normalizeDni(m.user.documentNumber ?? "") === dni,
  );
  if (!clash) {
    return { ok: true, dni, match: null };
  }

  return {
    ok: true,
    dni,
    match: {
      userId: clash.user.id,
      name: clash.user.name,
      documentNumber: clash.user.documentNumber ?? dni,
      role: clash.role,
      roleLabel: ROLE_LABELS[clash.role] ?? "persona",
    },
  };
}

export function dniAlreadyLoadedMessage(match: OrgDniMatch, dni: string): string {
  return `El DNI ${dni} ya está cargado como ${match.roleLabel.toLowerCase()}: ${match.name}. Buscalo en la lista en lugar de cargarlo de cero.`;
}
