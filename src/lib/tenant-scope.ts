import type { OrganizationRole, Prisma } from "@prisma/client";
import type { OrganizationSession } from "@/lib/auth";
import { isStaffRole } from "@/lib/session";

/** Filtro de propiedades según rol. */
export function propertyScopeWhere(
  session: OrganizationSession,
): Prisma.PropertyWhereInput {
  const base: Prisma.PropertyWhereInput = {
    organizationId: session.organizationId,
  };
  if (isStaffRole(session.organizationRole)) return base;
  if (session.organizationRole === "OWNER") {
    return {
      ...base,
      ownerships: { some: { ownerId: session.user.id } },
    };
  }
  if (session.organizationRole === "TENANT") {
    return {
      ...base,
      contracts: {
        some: {
          parties: {
            some: { userId: session.user.id, role: "TENANT" },
          },
        },
      },
    };
  }
  // SUPPLIER / VIEWER: sin propiedades operativas
  return { ...base, id: "__none__" };
}

export function contractScopeWhere(
  session: OrganizationSession,
): Prisma.ContractWhereInput {
  const base: Prisma.ContractWhereInput = {
    organizationId: session.organizationId,
  };
  if (isStaffRole(session.organizationRole)) return base;
  if (session.organizationRole === "OWNER") {
    return {
      ...base,
      OR: [
        { parties: { some: { userId: session.user.id, role: "OWNER" } } },
        {
          property: {
            ownerships: { some: { ownerId: session.user.id } },
          },
        },
      ],
    };
  }
  if (session.organizationRole === "TENANT") {
    return {
      ...base,
      parties: { some: { userId: session.user.id, role: "TENANT" } },
    };
  }
  return { ...base, id: "__none__" };
}

export function billScopeWhere(
  session: OrganizationSession,
): Prisma.TenantBillWhereInput {
  if (isStaffRole(session.organizationRole)) {
    return { contract: { organizationId: session.organizationId } };
  }
  if (session.organizationRole === "TENANT") {
    return {
      contract: {
        organizationId: session.organizationId,
        parties: { some: { userId: session.user.id, role: "TENANT" } },
      },
    };
  }
  if (session.organizationRole === "OWNER") {
    return {
      contract: {
        organizationId: session.organizationId,
        OR: [
          { parties: { some: { userId: session.user.id, role: "OWNER" } } },
          {
            property: {
              ownerships: { some: { ownerId: session.user.id } },
            },
          },
        ],
      },
    };
  }
  return { id: "__none__" };
}

export function workOrderScopeWhere(
  session: OrganizationSession,
): Prisma.WorkOrderWhereInput {
  const base: Prisma.WorkOrderWhereInput = {
    organizationId: session.organizationId,
  };
  if (isStaffRole(session.organizationRole)) return base;
  if (session.organizationRole === "SUPPLIER") {
    return { ...base, assigneeId: session.user.id };
  }
  if (session.organizationRole === "OWNER") {
    return {
      ...base,
      property: { ownerships: { some: { ownerId: session.user.id } } },
    };
  }
  if (session.organizationRole === "TENANT") {
    return {
      ...base,
      contract: {
        parties: { some: { userId: session.user.id, role: "TENANT" } },
      },
    };
  }
  return { ...base, id: "__none__" };
}

export function settlementScopeWhere(
  session: OrganizationSession,
): Prisma.OwnerSettlementWhereInput {
  const base: Prisma.OwnerSettlementWhereInput = {
    organizationId: session.organizationId,
  };
  if (isStaffRole(session.organizationRole)) return base;
  if (session.organizationRole === "OWNER") {
    return { ...base, ownerId: session.user.id };
  }
  return { ...base, id: "__none__" };
}

export function expenseScopeWhere(
  session: OrganizationSession,
): Prisma.ExpenseWhereInput {
  const base: Prisma.ExpenseWhereInput = {
    organizationId: session.organizationId,
  };
  if (isStaffRole(session.organizationRole)) return base;
  if (session.organizationRole === "OWNER") {
    return {
      ...base,
      complex: {
        units: {
          some: {
            property: {
              ownerships: { some: { ownerId: session.user.id } },
            },
          },
        },
      },
    };
  }
  return { ...base, id: "__none__" };
}

export function leadScopeWhere(
  session: OrganizationSession,
): Prisma.LeadWhereInput {
  return { organizationId: session.organizationId };
}

export function complexScopeWhere(
  session: OrganizationSession,
): Prisma.ComplexWhereInput {
  return { organizationId: session.organizationId };
}

/** Catálogo público: publicadas, disponibles/reservadas, orgs activas o exentas. */
export function publicOrganizationPropertyFilter(): Prisma.PropertyWhereInput {
  return {
    status: { in: ["AVAILABLE", "RESERVED"] },
    publishedAt: { not: null },
    organization: {
      billingStatus: { in: ["ACTIVE", "EXEMPT"] },
    },
  };
}

export function assertStaffMutation(role: OrganizationRole): void {
  if (!isStaffRole(role)) throw new Error("FORBIDDEN");
}

export function assertOrgAdmin(role: OrganizationRole): void {
  if (role !== "ADMIN") throw new Error("FORBIDDEN");
}
