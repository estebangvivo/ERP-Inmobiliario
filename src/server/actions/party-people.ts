"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { isValidDni, normalizeDni } from "@/lib/dni";
import { ROLE_DEFAULT_MODULES } from "@/features/auth/lib/modules";
import { hashPassword } from "@/features/auth/lib/password";
import {
  dniAlreadyLoadedMessage,
  lookupOrgMemberByDni,
  type OrgDniMatch,
} from "@/server/lib/org-dni";

export type PartyPersonKind = "OWNER" | "TENANT" | "GUARANTOR" | "SUPPLIER";

const PARTY_PERSON_ROLES = [
  "OWNER",
  "TENANT",
  "GUARANTOR",
  "SUPPLIER",
] as const satisfies readonly PartyPersonKind[];

const PARTY_KIND_LABEL: Record<PartyPersonKind, string> = {
  OWNER: "propietario",
  TENANT: "inquilino",
  GUARANTOR: "garante",
  SUPPLIER: "proveedor",
};

export type CreatePartyPersonResult =
  | {
      ok: true;
      person: { id: string; name: string; documentNumber: string };
    }
  | { ok: false; error: string };

export type CheckPersonDniResult =
  | { ok: true; dni: string; match: null }
  | { ok: true; dni: string; match: OrgDniMatch }
  | { ok: false; error: string };

/** Chequeo en vivo: ¿este DNI ya está en la organización? */
export async function checkPersonDniAction(
  rawDni: string,
  excludeUserId?: string,
): Promise<CheckPersonDniResult> {
  try {
    const session = await requireStaff();
    return lookupOrgMemberByDni(
      session.organizationId,
      rawDni,
      excludeUserId,
    );
  } catch (error) {
    console.error("checkPersonDniAction", error);
    return { ok: false, error: "No se pudo verificar el DNI." };
  }
}

/**
 * Alta rápida de propietario, inquilino o garante desde selectores de búsqueda.
 * Exige DNI y bloquea si ya existe ese documento en la organización.
 */
export async function createPartyPersonAction(input: {
  kind: PartyPersonKind;
  name: string;
  dni: string;
  phone?: string;
  email?: string;
}): Promise<CreatePartyPersonResult> {
  try {
    const session = await requireStaff();
    const orgId = session.organizationId;
    const name = input.name.trim();
    const phone = input.phone?.trim() || null;

    if (name.length < 2) {
      return { ok: false, error: "Ingresá el nombre completo." };
    }

    const lookup = await lookupOrgMemberByDni(orgId, input.dni);
    if (!lookup.ok) return { ok: false, error: lookup.error };
    if (lookup.match) {
      return {
        ok: false,
        error: dniAlreadyLoadedMessage(lookup.match, lookup.dni),
      };
    }
    const dni = lookup.dni;

    let email = input.email?.trim().toLowerCase() || "";
    if (email) {
      const taken = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (taken) {
        return {
          ok: false,
          error: "Ese email ya está registrado. Dejalo vacío o usá otro.",
        };
      }
    } else {
      email = `${input.kind.toLowerCase()}.${dni}.${orgId.slice(-8)}@parties.local`;
    }

    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          authId: `local:${email}`,
          email,
          name,
          phone,
          documentType: "DNI",
          documentNumber: dni,
          passwordHash,
          isActive: true,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name,
          phone: phone ?? user.phone,
          documentType: "DNI",
          documentNumber: dni,
        },
      });
    }

    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: user.id },
      },
    });
    if (existingMember) {
      if (PARTY_PERSON_ROLES.includes(existingMember.role as PartyPersonKind)) {
        return {
          ok: false,
          error: `Esa persona ya está cargada como ${
            PARTY_KIND_LABEL[existingMember.role as PartyPersonKind]
          }. Buscala en la lista en lugar de cargarla de cero.`,
        };
      }
      await prisma.organizationMember.update({
        where: { id: existingMember.id },
        data: {
          role: input.kind,
          allowedModules: ROLE_DEFAULT_MODULES[input.kind],
        },
      });
    } else {
      await prisma.organizationMember.create({
        data: {
          organizationId: orgId,
          userId: user.id,
          role: input.kind,
          allowedModules: ROLE_DEFAULT_MODULES[input.kind],
        },
      });
    }

    revalidatePath("/contratos");
    revalidatePath("/contratos/nuevo");
    revalidatePath("/usuarios");
    revalidatePath("/tesoreria");
    revalidatePath("/cobros");
    revalidatePath("/gestion/propiedades");
    revalidatePath("/rendiciones");
    revalidatePath("/mantenimiento");

    return {
      ok: true,
      person: {
        id: user.id,
        name,
        documentNumber: dni,
      },
    };
  } catch (error) {
    console.error("createPartyPersonAction", error);
    return { ok: false, error: "No se pudo crear la persona." };
  }
}

export type PartyPersonDetails = {
  id: string;
  name: string;
  documentNumber: string | null;
  phone: string | null;
};

export async function getPartyPersonAction(
  personId: string,
): Promise<{ ok: true; person: PartyPersonDetails } | { ok: false; error: string }> {
  try {
    const session = await requireStaff();
    const member = await prisma.organizationMember.findFirst({
      where: {
        organizationId: session.organizationId,
        userId: personId,
        role: { in: [...PARTY_PERSON_ROLES] },
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            documentNumber: true,
            phone: true,
          },
        },
      },
    });
    if (!member) {
      return { ok: false, error: "Persona no encontrada." };
    }
    return {
      ok: true,
      person: {
        id: member.user.id,
        name: member.user.name,
        documentNumber: member.user.documentNumber,
        phone: member.user.phone,
      },
    };
  } catch (error) {
    console.error("getPartyPersonAction", error);
    return { ok: false, error: "No se pudo cargar la persona." };
  }
}

export type UpdatePartyPersonResult =
  | {
      ok: true;
      person: { id: string; name: string; documentNumber: string };
    }
  | { ok: false; error: string };

/** Actualiza datos básicos de propietario, inquilino o garante. */
export async function updatePartyPersonAction(input: {
  personId: string;
  name: string;
  dni: string;
  phone?: string;
}): Promise<UpdatePartyPersonResult> {
  try {
    const session = await requireStaff();
    const orgId = session.organizationId;
    const name = input.name.trim();
    const phone = input.phone?.trim() || null;

    if (name.length < 2) {
      return { ok: false, error: "Ingresá el nombre completo." };
    }

    const member = await prisma.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        userId: input.personId,
        role: { in: [...PARTY_PERSON_ROLES] },
      },
      select: { userId: true },
    });
    if (!member) {
      return { ok: false, error: "Persona no encontrada en la organización." };
    }

    const lookup = await lookupOrgMemberByDni(orgId, input.dni, input.personId);
    if (!lookup.ok) return { ok: false, error: lookup.error };
    if (lookup.match) {
      return {
        ok: false,
        error: dniAlreadyLoadedMessage(lookup.match, lookup.dni),
      };
    }
    const dni = lookup.dni;

    const user = await prisma.user.update({
      where: { id: input.personId },
      data: {
        name,
        phone,
        documentType: "DNI",
        documentNumber: dni,
      },
      select: { id: true, name: true, documentNumber: true },
    });

    revalidatePath("/contratos");
    revalidatePath("/contratos/nuevo");
    revalidatePath("/usuarios");
    revalidatePath("/tesoreria");
    revalidatePath("/cobros");
    revalidatePath("/gestion/propiedades");
    revalidatePath("/rendiciones");
    revalidatePath("/mantenimiento");
    revalidatePath(`/personas/${user.id}`);

    return {
      ok: true,
      person: {
        id: user.id,
        name: user.name,
        documentNumber: user.documentNumber ?? dni,
      },
    };
  } catch (error) {
    console.error("updatePartyPersonAction", error);
    return { ok: false, error: "No se pudo actualizar la persona." };
  }
}
