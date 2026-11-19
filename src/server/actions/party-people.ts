"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { parseDateInput } from "@/lib/dates";
import { ROLE_DEFAULT_MODULES } from "@/features/auth/lib/modules";
import { hashPassword } from "@/features/auth/lib/password";
import { canonicalizeStoredPhone } from "@/features/auth/lib/phone";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function parseBirthDate(raw?: string | null): Date | null {
  if (!raw?.trim()) return null;
  return parseDateInput(raw.trim());
}

function validateContactFields(input: {
  email?: string;
  phone?: string;
  address?: string;
}): string | null {
  const email = input.email?.trim().toLowerCase() || "";
  if (!email || !EMAIL_RE.test(email)) {
    return "Ingresá un email válido.";
  }
  if (!input.phone?.trim()) {
    return "El teléfono es obligatorio.";
  }
  if (!input.address?.trim() || input.address.trim().length < 3) {
    return "Ingresá el domicilio actual.";
  }
  return null;
}

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
 * Exige DNI, email, teléfono y domicilio.
 */
export async function createPartyPersonAction(input: {
  kind: PartyPersonKind;
  name: string;
  dni: string;
  email: string;
  phone: string;
  phone2?: string;
  birthDate?: string;
  address: string;
}): Promise<CreatePartyPersonResult> {
  try {
    const session = await requireStaff();
    const orgId = session.organizationId;
    const name = input.name.trim();
    const phone = canonicalizeStoredPhone(input.phone) ?? "";
    const phone2 = canonicalizeStoredPhone(input.phone2);
    const address = input.address.trim();
    const birthDate = parseBirthDate(input.birthDate);

    if (name.length < 2) {
      return { ok: false, error: "Ingresá el nombre completo." };
    }
    const contactError = validateContactFields({
      email: input.email,
      phone,
      address,
    });
    if (contactError) return { ok: false, error: contactError };
    if (input.birthDate?.trim() && !birthDate) {
      return { ok: false, error: "Fecha de nacimiento inválida." };
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
    const email = input.email.trim().toLowerCase();

    const taken = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken) {
      return {
        ok: false,
        error: "Ese email ya está registrado. Usá otro o buscá a la persona.",
      };
    }

    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));

    const user = await prisma.user.create({
      data: {
        authId: `local:${email}`,
        email,
        name,
        phone,
        phone2,
        birthDate,
        address,
        documentType: "DNI",
        documentNumber: dni,
        passwordHash,
        isActive: true,
      },
    });

    await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        role: input.kind,
        allowedModules: ROLE_DEFAULT_MODULES[input.kind],
      },
    });

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
  email: string;
  phone: string | null;
  phone2: string | null;
  birthDate: string | null;
  address: string | null;
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
            email: true,
            phone: true,
            phone2: true,
            birthDate: true,
            address: true,
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
        email: member.user.email,
        phone: member.user.phone,
        phone2: member.user.phone2,
        birthDate: member.user.birthDate
          ? member.user.birthDate.toISOString().slice(0, 10)
          : null,
        address: member.user.address,
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

/** Actualiza datos de propietario, inquilino, garante o proveedor. */
export async function updatePartyPersonAction(input: {
  personId: string;
  name: string;
  dni: string;
  email: string;
  phone: string;
  phone2?: string;
  birthDate?: string;
  address: string;
}): Promise<UpdatePartyPersonResult> {
  try {
    const session = await requireStaff();
    const orgId = session.organizationId;
    const name = input.name.trim();
    const phone = canonicalizeStoredPhone(input.phone) ?? "";
    const phone2 = canonicalizeStoredPhone(input.phone2);
    const address = input.address.trim();
    const birthDate = parseBirthDate(input.birthDate);
    const email = input.email.trim().toLowerCase();

    if (name.length < 2) {
      return { ok: false, error: "Ingresá el nombre completo." };
    }
    const contactError = validateContactFields({ email, phone, address });
    if (contactError) return { ok: false, error: contactError };
    if (input.birthDate?.trim() && !birthDate) {
      return { ok: false, error: "Fecha de nacimiento inválida." };
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

    const emailTaken = await prisma.user.findFirst({
      where: { email, id: { not: input.personId } },
      select: { id: true },
    });
    if (emailTaken) {
      return { ok: false, error: "Ese email ya está registrado en otra persona." };
    }

    const user = await prisma.user.update({
      where: { id: input.personId },
      data: {
        name,
        email,
        phone,
        phone2,
        birthDate,
        address,
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
