import type { OrganizationRole } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  organizationRole: OrganizationRole | null;
};
