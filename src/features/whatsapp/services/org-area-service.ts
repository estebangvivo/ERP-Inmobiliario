import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { scoreAreaMatch } from "@/features/auth/lib/areas";
import { prisma } from "@/lib/prisma";

export type OrgAreaMatch = {
  id: string;
  name: string;
  /** Agentes activos asignados al área. */
  agentUserIds: string[];
};

/**
 * Busca, entre las áreas activas de la empresa (ABM de áreas), la que mejor
 * coincide con el texto del cliente (nombre o palabras clave).
 */
export async function matchOrgAreaFromText(
  organizationId: string,
  text: string,
): Promise<OrgAreaMatch | null> {
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;

  const areas = await prisma.area.findMany({
    where: { organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      keywords: true,
      members: {
        where: {
          role: "AGENT",
          user: { isActive: true, ...excludePlatformSuperadminFromUser() },
        },
        select: { userId: true },
      },
    },
  });
  if (areas.length === 0) return null;

  let best: { area: (typeof areas)[number]; score: number } | null = null;
  for (const area of areas) {
    const score = scoreAreaMatch(trimmed, area);
    if (score > 0 && (!best || score > best.score)) best = { area, score };
  }
  if (!best) return null;

  return {
    id: best.area.id,
    name: best.area.name,
    agentUserIds: best.area.members.map((m) => m.userId),
  };
}
