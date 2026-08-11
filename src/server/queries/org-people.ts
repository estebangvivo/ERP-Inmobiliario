import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { prisma } from "@/lib/prisma";

export type OrgPersonRole =
  | "OWNER"
  | "TENANT"
  | "GUARANTOR"
  | "VIEWER"
  | "AGENT";

export async function listOrgPeople(
  organizationId: string,
  roles: OrgPersonRole[],
) {
  const rows = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: { in: roles },
      user: {
        isActive: true,
        ...excludePlatformSuperadminFromUser(),
      },
    },
    include: {
      user: { select: { id: true, name: true, documentNumber: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => r.user);
}
