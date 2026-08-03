import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTurneroOrg } from "@/features/turnero/lib/api-auth";
import { esEstado } from "@/features/turnero/lib/turnos";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Contexto) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const turno = await prisma.turneroTurno.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!turno) {
    return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
  }

  return NextResponse.json(turno, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function PATCH(request: NextRequest, { params }: Contexto) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as {
      estado?: unknown;
      puesto?: unknown;
    };

    if (!id || !esEstado(body.estado)) {
      return NextResponse.json(
        { error: "ID o estado inválido" },
        { status: 400 },
      );
    }

    if (
      body.estado === "LLAMADO" &&
      (typeof body.puesto !== "string" || !body.puesto.trim())
    ) {
      return NextResponse.json(
        { error: "Debe indicar el puesto para llamar un turno" },
        { status: 400 },
      );
    }

    const existente = await prisma.turneroTurno.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!existente) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }

    const turno = await prisma.turneroTurno.update({
      where: { id },
      data:
        body.estado === "LLAMADO"
          ? {
              estado: "LLAMADO",
              puesto: (body.puesto as string).trim().slice(0, 80),
              // Se renueva también al re-llamar; la pantalla detecta esta señal.
              llamadoEn: new Date(),
            }
          : { estado: body.estado },
    });

    return NextResponse.json(turno, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("No se pudo actualizar el turno:", error);
    return NextResponse.json(
      { error: "Turno no encontrado o actualización inválida" },
      { status: 404 },
    );
  }
}
