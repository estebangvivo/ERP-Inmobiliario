"use server";

import { revalidatePath } from "next/cache";
import type { OrganizationRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireAuthSession,
  type SessionContext,
} from "@/lib/auth";
import {
  excludePlatformSuperadminFromUser,
  isPlatformSuperadminEmail,
} from "@/features/auth/lib/platform-admin";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/features/auth/lib/password";
import {
  ORG_MODULE_KEYS,
  type AppModuleKey,
} from "@/features/auth/lib/modules";
import {
  parseUserListPageSize,
  USER_LIST_DEFAULT_PAGE_SIZE,
  type UserListStatus,
} from "@/features/auth/lib/user-list";
import {
  dniAlreadyLoadedMessage,
  lookupOrgMemberByDni,
} from "@/server/lib/org-dni";
import { parseDateInput } from "@/lib/dates";

const PARTY_ROLES_REQUIRING_DNI: OrganizationRole[] = [
  "OWNER",
  "TENANT",
  "GUARANTOR",
];

function parseOptionalBirthDate(raw?: string | null): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw?.trim()) return null;
  return parseDateInput(raw.trim());
}

export type UserActionResult =
  | { ok: true; userId?: string }
  | { ok: false; error: string };

export type OrganizationUserRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  allowedModules: string[];
  isActive: boolean;
  documentNumber: string | null;
  phone: string | null;
  phone2: string | null;
  birthDate: string | null;
  address: string | null;
};

export type ListOrganizationUsersOptions = {
  q?: string;
  role?: OrganizationRole;
  status?: UserListStatus;
  page?: number;
  pageSize?: number;
};

export type ListOrganizationUsersResult = {
  users: OrganizationUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

function mapMember(m: {
  id: string;
  userId: string;
  role: OrganizationRole;
  allowedModules: string[];
  user: {
    name: string;
    email: string;
    isActive: boolean;
    documentNumber: string | null;
    phone: string | null;
    phone2: string | null;
    birthDate: Date | null;
    address: string | null;
  };
}): OrganizationUserRow {
  return {
    membershipId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    allowedModules: m.allowedModules,
    isActive: m.user.isActive,
    documentNumber: m.user.documentNumber,
    phone: m.user.phone,
    phone2: m.user.phone2,
    birthDate: m.user.birthDate
      ? m.user.birthDate.toISOString().slice(0, 10)
      : null,
    address: m.user.address,
  };
}

async function assertCanManageUsers(
  organizationId: string,
): Promise<SessionContext> {
  const session = await requireAuthSession();
  const isSuper = isPlatformSuperadminEmail(session.user.email);
  if (!isSuper && session.organizationRole !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  if (!isSuper && session.organizationId !== organizationId) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

function assertNotProtectingPlatformSuperadmin(
  actorEmail: string,
  targetEmail: string,
): UserActionResult | null {
  if (!isPlatformSuperadminEmail(targetEmail)) return null;
  if (isPlatformSuperadminEmail(actorEmail)) return null;
  return {
    ok: false,
    error: "No podés gestionar la cuenta de superadmin de plataforma.",
  };
}

export async function listOrganizationUsers(
  organizationId?: string,
  options: ListOrganizationUsersOptions = {},
): Promise<ListOrganizationUsersResult> {
  const session = await requireAuthSession();
  const orgId = organizationId ?? session.organizationId;
  if (!orgId) {
    return { users: [], total: 0, page: 1, pageSize: USER_LIST_DEFAULT_PAGE_SIZE };
  }
  await assertCanManageUsers(orgId);

  const q = options.q?.trim() ?? "";
  const userWhere: Prisma.UserWhereInput = {
    ...excludePlatformSuperadminFromUser(),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { documentNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(options.status === "activo"
      ? { isActive: true }
      : options.status === "inactivo"
        ? { isActive: false }
        : {}),
  };

  const where: Prisma.OrganizationMemberWhereInput = {
    organizationId: orgId,
    user: userWhere,
    ...(options.role ? { role: options.role } : {}),
  };

  const paginate = options.pageSize != null;
  const pageSize = paginate
    ? parseUserListPageSize(String(options.pageSize))
    : USER_LIST_DEFAULT_PAGE_SIZE;
  const requestedPage = Math.max(1, options.page ?? 1);

  const total = await prisma.organizationMember.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = paginate ? Math.min(requestedPage, totalPages) : 1;

  const members = await prisma.organizationMember.findMany({
    where,
    include: { user: true },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
  });

  return {
    users: members.map(mapMember),
    total,
    page,
    pageSize: paginate ? pageSize : members.length || pageSize,
  };
}

export async function createOrganizationUser(input: {
  organizationId?: string;
  name: string;
  email: string;
  password: string;
  role: OrganizationRole;
  allowedModules?: AppModuleKey[];
  phone?: string;
  phone2?: string;
  birthDate?: string;
  address?: string;
  documentNumber?: string;
}): Promise<UserActionResult> {
  try {
    const session = await requireAuthSession();
    const orgId = input.organizationId ?? session.organizationId;
    if (!orgId) return { ok: false, error: "Empresa requerida." };
    await assertCanManageUsers(orgId);

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const phone = input.phone?.trim() || "";
    const phone2 = input.phone2?.trim() || null;
    const address = input.address?.trim() || "";
    const birthDate = parseOptionalBirthDate(input.birthDate);
    if (
      isPlatformSuperadminEmail(email) &&
      !isPlatformSuperadminEmail(session.user.email)
    ) {
      return {
        ok: false,
        error: "Ese email está reservado para la plataforma.",
      };
    }
    const pwdCheck = validatePasswordStrength(input.password);
    if (!pwdCheck.ok) return { ok: false, error: pwdCheck.error };
    if (name.length < 2) return { ok: false, error: "Nombre requerido." };
    if (!phone) return { ok: false, error: "El teléfono es obligatorio." };
    if (address.length < 3) {
      return { ok: false, error: "Ingresá el domicilio actual." };
    }
    if (input.birthDate?.trim() && birthDate === null) {
      return { ok: false, error: "Fecha de nacimiento inválida." };
    }

    const requiresDni = PARTY_ROLES_REQUIRING_DNI.includes(input.role);
    const rawDni = input.documentNumber?.trim() ?? "";
    let dni: string | null = null;
    if (requiresDni || rawDni) {
      if (!rawDni) {
        return {
          ok: false,
          error: "El DNI es obligatorio para propietario, inquilino o garante.",
        };
      }
      const lookup = await lookupOrgMemberByDni(orgId, rawDni);
      if (!lookup.ok) return { ok: false, error: lookup.error };
      if (lookup.match) {
        return {
          ok: false,
          error: dniAlreadyLoadedMessage(lookup.match, lookup.dni),
        };
      }
      dni = lookup.dni;
    }

    const modules = (input.allowedModules ?? []).filter((m) =>
      ORG_MODULE_KEYS.includes(m),
    );
    if (!modules.includes("home")) modules.push("home");
    if (!modules.includes("manual")) modules.push("manual");

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          authId: `local:${email}`,
          email,
          name,
          phone,
          phone2,
          birthDate: birthDate ?? null,
          address,
          documentType: dni ? "DNI" : null,
          documentNumber: dni,
          passwordHash: await hashPassword(input.password),
        },
      });
    } else if (dni && !user.documentNumber) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name,
          phone: phone || user.phone,
          phone2: phone2 ?? user.phone2,
          birthDate: birthDate === undefined ? user.birthDate : birthDate,
          address: address || user.address,
          documentType: "DNI",
          documentNumber: dni,
        },
      });
    }

    const existing = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: orgId, userId: user.id },
      },
    });
    if (existing) {
      return { ok: false, error: "Ese usuario ya pertenece a la empresa." };
    }

    await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        role: input.role,
        allowedModules: modules,
      },
    });

    revalidatePath("/usuarios");
    revalidatePath("/admin");
    return { ok: true, userId: user.id };
  } catch (error) {
    console.error("createOrganizationUser", error);
    return { ok: false, error: "No se pudo crear el usuario." };
  }
}

export async function updateOrganizationUser(input: {
  organizationId?: string;
  userId: string;
  name?: string;
  role?: OrganizationRole;
  allowedModules?: AppModuleKey[];
  isActive?: boolean;
  password?: string;
  documentNumber?: string;
  phone?: string;
  phone2?: string;
  birthDate?: string;
  address?: string;
}): Promise<UserActionResult> {
  try {
    const session = await requireAuthSession();
    const orgId = input.organizationId ?? session.organizationId;
    if (!orgId) return { ok: false, error: "Empresa requerida." };
    await assertCanManageUsers(orgId);

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: input.userId,
        },
      },
      include: { user: true },
    });
    if (!membership) {
      return { ok: false, error: "Usuario no encontrado en la empresa." };
    }

    const blocked = assertNotProtectingPlatformSuperadmin(
      session.user.email,
      membership.user.email,
    );
    if (blocked) return blocked;

    const nextRole = input.role ?? membership.role;
    const requiresDni = PARTY_ROLES_REQUIRING_DNI.includes(nextRole);
    const rawDni =
      input.documentNumber !== undefined
        ? input.documentNumber.trim()
        : membership.user.documentNumber ?? "";

    let dni: string | null = membership.user.documentNumber;
    if (requiresDni || (input.documentNumber !== undefined && rawDni)) {
      if (!rawDni) {
        return {
          ok: false,
          error: "El DNI es obligatorio para propietario, inquilino o garante.",
        };
      }
      const lookup = await lookupOrgMemberByDni(orgId, rawDni, input.userId);
      if (!lookup.ok) return { ok: false, error: lookup.error };
      if (lookup.match) {
        return {
          ok: false,
          error: dniAlreadyLoadedMessage(lookup.match, lookup.dni),
        };
      }
      dni = lookup.dni;
    } else if (input.documentNumber !== undefined && !rawDni) {
      dni = null;
    }

    const birthDate = parseOptionalBirthDate(input.birthDate);
    if (input.birthDate !== undefined && input.birthDate.trim() && birthDate === null) {
      return { ok: false, error: "Fecha de nacimiento inválida." };
    }
    if (input.phone !== undefined && !input.phone.trim()) {
      return { ok: false, error: "El teléfono es obligatorio." };
    }
    if (input.address !== undefined && input.address.trim().length < 3) {
      return { ok: false, error: "Ingresá el domicilio actual." };
    }

    const userData: {
      name?: string;
      isActive?: boolean;
      passwordHash?: string;
      documentType?: string | null;
      documentNumber?: string | null;
      phone?: string | null;
      phone2?: string | null;
      birthDate?: Date | null;
      address?: string | null;
    } = {};
    if (input.name) userData.name = input.name.trim();
    if (typeof input.isActive === "boolean") userData.isActive = input.isActive;
    if (input.password) {
      const pwdCheck = validatePasswordStrength(input.password);
      if (!pwdCheck.ok) return { ok: false, error: pwdCheck.error };
      userData.passwordHash = await hashPassword(input.password);
    }
    if (input.documentNumber !== undefined || requiresDni) {
      userData.documentType = dni ? "DNI" : null;
      userData.documentNumber = dni;
    }
    if (input.phone !== undefined) {
      userData.phone = input.phone.trim() || null;
    }
    if (input.phone2 !== undefined) {
      userData.phone2 = input.phone2.trim() || null;
    }
    if (input.birthDate !== undefined) {
      userData.birthDate = birthDate ?? null;
    }
    if (input.address !== undefined) {
      userData.address = input.address.trim() || null;
    }

    if (Object.keys(userData).length > 0) {
      await prisma.user.update({
        where: { id: input.userId },
        data: userData,
      });
    }

    const memberData: {
      role?: OrganizationRole;
      allowedModules?: string[];
    } = {};
    if (input.role) memberData.role = input.role;
    if (input.allowedModules) {
      const nextModules = input.allowedModules.filter((m) =>
        ORG_MODULE_KEYS.includes(m),
      );
      if (!nextModules.includes("home")) nextModules.push("home");
      if (!nextModules.includes("manual")) nextModules.push("manual");
      memberData.allowedModules = nextModules;
    }

    if (Object.keys(memberData).length > 0) {
      await prisma.organizationMember.update({
        where: { id: membership.id },
        data: memberData,
      });
    }

    revalidatePath("/usuarios");
    revalidatePath("/admin");
    return { ok: true, userId: input.userId };
  } catch (error) {
    console.error("updateOrganizationUser", error);
    return { ok: false, error: "No se pudo actualizar el usuario." };
  }
}

export async function getMyAssignedTurneroPuesto(): Promise<{
  id: string;
  nombre: string;
  categoria: string;
} | null> {
  try {
    const session = await requireAuthSession();
    if (!session.organizationId) return null;
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: session.organizationId,
          userId: session.user.id,
        },
      },
      include: { turneroPuesto: true },
    });

    const puesto = membership?.turneroPuesto;
    if (!puesto?.activo) return null;

    return {
      id: puesto.id,
      nombre: puesto.nombre,
      categoria: puesto.categoria,
    };
  } catch {
    return null;
  }
}

export async function removeOrganizationUser(input: {
  organizationId?: string;
  userId: string;
}): Promise<UserActionResult> {
  try {
    const session = await requireAuthSession();
    const orgId = input.organizationId ?? session.organizationId;
    if (!orgId) return { ok: false, error: "Empresa requerida." };
    await assertCanManageUsers(orgId);

    if (input.userId === session.user.id) {
      return { ok: false, error: "No podés eliminarte a vos mismo." };
    }

    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!target) return { ok: false, error: "Usuario no encontrado." };

    const blocked = assertNotProtectingPlatformSuperadmin(
      session.user.email,
      target.email,
    );
    if (blocked) return blocked;

    await prisma.organizationMember.deleteMany({
      where: { organizationId: orgId, userId: input.userId },
    });

    revalidatePath("/usuarios");
    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("removeOrganizationUser", error);
    return { ok: false, error: "No se pudo quitar el usuario." };
  }
}
