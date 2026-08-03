import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTurneroOrg } from "@/features/turnero/lib/api-auth";
import { claveFechaLocal, limitesDelDia } from "@/features/turnero/lib/turnos";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      cancelarActivos?: boolean;
    };
    const organizationId = session.organizationId;
    const fecha = claveFechaLocal();

    const resultado = await prisma.$transaction(async (tx) => {
      const contadores = await tx.turneroContadorDiario.updateMany({
        where: { organizationId, fecha },
        data: { valor: 0 },
      });

      let cancelados = 0;
      if (body.cancelarActivos === true) {
        const { inicio, fin } = limitesDelDia();
        const actualizados = await tx.turneroTurno.updateMany({
          where: {
            organizationId,
            creadoEn: { gte: inicio, lt: fin },
            estado: { in: ["ESPERA", "LLAMADO"] },
          },
          data: { estado: "CANCELADO" },
        });
        cancelados = actualizados.count;
      }

      return { contadoresReiniciados: contadores.count, turnosCancelados: cancelados };
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("No se pudo reiniciar la numeración:", error);
    return NextResponse.json(
      { error: "No se pudo reiniciar la numeración" },
      { status: 500 },
    );
  }
}
