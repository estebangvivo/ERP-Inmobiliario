import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEV_ORG_SLUG } from "@/lib/auth-config";
import { limitesDelDia } from "@/features/turnero/lib/turnos";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

/**
 * Lectura pública para el monitor de sala (/turnero/pantalla).
 * Solo turnos del día; no requiere sesión.
 * Org: sesión activa → esa org; si no, ?org=slug o TURNERO_PUBLIC_ORG_SLUG / demo.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession().catch(() => null);
    let organizationId = session?.organizationId ?? null;

    if (!organizationId) {
      const slug =
        request.nextUrl.searchParams.get("org")?.trim() ||
        process.env.TURNERO_PUBLIC_ORG_SLUG?.trim() ||
        DEV_ORG_SLUG;

      const org = await prisma.organization.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!org) {
        return NextResponse.json(
          { error: "Organización no encontrada" },
          { status: 404, headers: noStore },
        );
      }
      organizationId = org.id;
    }

    const { inicio, fin } = limitesDelDia();
    const turnos = await prisma.turneroTurno.findMany({
      where: {
        organizationId,
        creadoEn: { gte: inicio, lt: fin },
      },
      orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
    });

    return NextResponse.json(turnos, { headers: noStore });
  } catch (error) {
    console.error("GET /api/turnero/pantalla:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los turnos" },
      { status: 500, headers: noStore },
    );
  }
}
