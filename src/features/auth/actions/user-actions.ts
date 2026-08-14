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
  user: { name: string; email: string; isActive: boolean };
}): OrganizationUserRow {
  return {
    membershipId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    allowedModules: m.allowedModules,
    isActive: m.user.isActive,
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
}): Promise<UserActionResult> {
  try {
    const session = await requireAuthSession();
    const orgId = input.organizationId ?? session.organizationId;
    if (!orgId) return { ok: false, error: "Empresa requerida." };
    await assertCanManageUsers(orgId);

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
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

    const modules = (input.allowedModules ?? []).filter((m) =>
      ORG_MODULE_KEYS.includes(m),
    );

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          authId: `local:${email}`,
          email,
          name,
          phone: input.phone?.trim() || null,
          passwordHash: await hashPassword(input.password),
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

    const userData: {
      name?: string;
      isActive?: boolean;
      passwordHash?: string;
    } = {};
    if (input.name) userData.name = input.name.trim();
    if (typeof input.isActive === "boolean") userData.isActive = input.isActive;
    if (input.password) {
      const pwdCheck = validatePasswordStrength(input.password);
      if (!pwdCheck.ok) return { ok: false, error: pwdCheck.error };
      userData.passwordHash = await hashPassword(input.password);
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
      memberData.allowedModules = input.allowedModules.filter((m) =>
        ORG_MODULE_KEYS.includes(m),
      );
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
