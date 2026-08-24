import type { OrganizationRole } from "@prisma/client";

export const USER_LIST_PAGE_SIZES = [10, 20, 50, 100] as const;
export const USER_LIST_DEFAULT_PAGE_SIZE = 10;
export type UserListPageSize = (typeof USER_LIST_PAGE_SIZES)[number];

export const USER_LIST_ROLES: OrganizationRole[] = [
  "ADMIN",
  "AGENT",
  "OWNER",
  "TENANT",
  "GUARANTOR",
  "SUPPLIER",
  "VIEWER",
];

export type UserListStatus = "activo" | "inactivo";

export function parseUserListPageSize(raw?: string): UserListPageSize {
  const n = Number(raw);
  return (USER_LIST_PAGE_SIZES as readonly number[]).includes(n)
    ? (n as UserListPageSize)
    : USER_LIST_DEFAULT_PAGE_SIZE;
}

export function parseUserListRole(raw?: string): OrganizationRole | undefined {
  return USER_LIST_ROLES.includes(raw as OrganizationRole)
    ? (raw as OrganizationRole)
    : undefined;
}

export function parseUserListStatus(raw?: string): UserListStatus | undefined {
  return raw === "activo" || raw === "inactivo" ? raw : undefined;
}
