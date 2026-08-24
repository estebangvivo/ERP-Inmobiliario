"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { isValidDni, normalizeDni } from "@/lib/dni";
import { ROLE_DEFAULT_MODULES } from "@/features/auth/lib/modules";
import { hashPassword } from "@/features/auth/lib/password";

export type PartyPersonKind = "OWNER" | "TENANT" | "GUARANTOR";

const PARTY_KIND_LABEL: Record<PartyPersonKind, string> = {
  OWNER: "propietario",
  TENANT: "inquilino",
  GUARANTOR: "garante",
};

export type CreatePartyPersonResult =
  | {
      ok: true;
      person: { id: string; name: string; documentNumber: string };
    }
  | { ok: false; error: string };

/**
 * Alta rápida de propietario, inquilino o garante desde selectores de búsqueda.
 * Exige DNI y bloquea si ya existe ese documento como parte en la organización.
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
    const dni = normalizeDni(input.dni);
    const phone = input.phone?.trim() || null;

    if (name.length < 2) {
      return { ok: false, error: "Ingresá el nombre completo." };
    }
    if (!isValidDni(dni)) {
      return {
        ok: false,
        error: "DNI inválido. Usá entre 7 y 11 dígitos.",
      };
    }

    const membersWithDoc = await prisma.organizationMember.findMany({
      where: {
        organizationId: orgId,
        role: { in: ["OWNER", "TENANT", "GUARANTOR"] },
        user: { documentNumber: { not: null } },
      },
      include: {
        user: { select: { id: true, name: true, documentNumber: true } },
      },
    });

    const clash = membersWithDoc.find(
      (m) => normalizeDni(m.user.documentNumber ?? "") === dni,
    );
    if (clash) {
      const as =
        clash.role in PARTY_KIND_LABEL
          ? PARTY_KIND_LABEL[clash.role as PartyPersonKind]
          : "persona";
      return {
        ok: false,
        error: `Ya existe el DNI ${dni} como ${as}: ${clash.user.name}.`,
      };
    }

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
      if (existingMember.role in PARTY_KIND_LABEL) {
        return {
          ok: false,
          error: `Esa persona ya está cargada como ${
            PARTY_KIND_LABEL[existingMember.role as PartyPersonKind]
          }.`,
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
