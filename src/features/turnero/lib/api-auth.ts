import { getOrganizationSession, type OrganizationSession } from "@/lib/auth";

export async function requireTurneroOrg(): Promise<OrganizationSession | null> {
  return getOrganizationSession();
}
