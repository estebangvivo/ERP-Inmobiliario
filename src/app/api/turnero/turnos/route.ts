import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTurneroOrg } from "@/features/turnero/lib/api-auth";
import {
  esCategoria,
  claveFechaLocal,
  limitesDelDia,
  codigoTurno,
} from "@/features/turnero/lib/turnos";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: NextRequest) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const scope = request.nextUrl.searchParams.get("scope") ?? "activos";
  const { inicio, fin } = limitesDelDia();

  const turnos = await prisma.turneroTurno.findMany({
    where:
      scope === "hoy"
        ? {
            organizationId: session.organizationId,
            creadoEn: { gte: inicio, lt: fin },
          }
        : {
            organizationId: session.organizationId,
            OR: [
              {
                creadoEn: { gte: inicio, lt: fin },
                estado: { in: ["ESPERA", "LLAMADO"] },
              },
              // Turnos LLAMADO de días anteriores (quedaron colgados): hay que poder finalizarlos
              { estado: "LLAMADO" },
            ],
          },
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
  });

  return NextResponse.json(turnos, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      categoria?: unknown;
      clienteId?: unknown;
    };

    if (!esCategoria(body.categoria)) {
      return NextResponse.json(
        { error: "Categoría inválida" },
        { status: 400 },
      );
    }

    const clienteId = typeof body.clienteId === "string" ? body.clienteId : null;
    if (!clienteId) {
      return NextResponse.json(
        { error: "Debe identificarse con su DNI antes de sacar un turno" },
        { status: 401 },
      );
    }

    const cliente = await prisma.turneroCliente.findFirst({
      where: { id: clienteId, organizationId: session.organizationId },
    });
    if (!cliente) {
      return NextResponse.json(
        { error: "Cliente no encontrado; vuelva a ingresar su DNI" },
        { status: 404 },
      );
    }

    const categoria = body.categoria;
    const fecha = claveFechaLocal();
    const organizationId = session.organizationId;

    const turno = await prisma.$transaction(async (tx) => {
      await tx.turneroContadorDiario.upsert({
        where: {
          organizationId_fecha_categoria: { organizationId, fecha, categoria },
        },
        create: { organizationId, fecha, categoria, valor: 1 },
        update: { valor: { increment: 1 } },
      });

      return tx.turneroTurno.create({
        data: {
          organizationId,
          codigo: codigoTurno(categoria, cliente.nombre),
          categoria,
          estado: "ESPERA",
          clienteId: cliente.id,
        },
        include: {
          cliente: { select: { id: true, dni: true, nombre: true } },
        },
      });
    });

    return NextResponse.json(turno, { status: 201, headers: noStore });
  } catch (error) {
    console.error("No se pudo crear el turno:", error);
    return NextResponse.json(
      { error: "No se pudo crear el turno" },
      { status: 500 },
    );
  }
}

// Acción atómica para evitar que dos operadores tomen el mismo turno.
export async function PATCH(request: NextRequest) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      accion?: unknown;
      categoria?: unknown;
      puesto?: unknown;
    };

    if (
      body.accion !== "LLAMAR_SIGUIENTE" ||
      !esCategoria(body.categoria) ||
      typeof body.puesto !== "string" ||
      !body.puesto.trim()
    ) {
      return NextResponse.json(
        { error: "Acción, categoría o puesto inválidos" },
        { status: 400 },
      );
    }

    const categoria = body.categoria;
    const puesto = body.puesto.trim().slice(0, 80);
    const organizationId = session.organizationId;
    const { inicio, fin } = limitesDelDia();

    const resultado = await prisma.$transaction(async (tx) => {
      // Cerrar turnos LLAMADO de días anteriores del mismo puesto (quedan "fantasma"
      // y bloqueaban "Llamar siguiente" sin aparecer en la UI del día).
      await tx.turneroTurno.updateMany({
        where: {
          organizationId,
          estado: "LLAMADO",
          puesto,
          creadoEn: { lt: inicio },
        },
        data: { estado: "ATENDIDO" },
      });

      const enAtencion = await tx.turneroTurno.findFirst({
        where: {
          organizationId,
          estado: "LLAMADO",
          puesto,
          creadoEn: { gte: inicio, lt: fin },
        },
        orderBy: { llamadoEn: "desc" },
      });
      if (enAtencion) return { tipo: "OCUPADO" as const, turno: enAtencion };

      const siguiente = await tx.turneroTurno.findFirst({
        where: {
          organizationId,
          categoria,
          estado: "ESPERA",
          creadoEn: { gte: inicio, lt: fin },
        },
        orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      });
      if (!siguiente) return { tipo: "VACIO" as const };

      const reservado = await tx.turneroTurno.updateMany({
        where: { id: siguiente.id, organizationId, estado: "ESPERA" },
        data: { estado: "LLAMADO", puesto, llamadoEn: new Date() },
      });
      if (reservado.count !== 1) return { tipo: "CONFLICTO" as const };

      const turno = await tx.turneroTurno.findFirstOrThrow({
        where: { id: siguiente.id, organizationId },
      });
      return { tipo: "OK" as const, turno };
    });

    if (resultado.tipo === "VACIO") {
      return NextResponse.json(
        { error: "No hay turnos en espera para esta categoría" },
        { status: 404 },
      );
    }
    if (resultado.tipo === "OCUPADO") {
      return NextResponse.json(
        { error: "Finalice el turno actual antes de llamar otro", turno: resultado.turno },
        { status: 409 },
      );
    }
    if (resultado.tipo === "CONFLICTO") {
      return NextResponse.json(
        { error: "La cola cambió; vuelva a intentar" },
        { status: 409 },
      );
    }

    return NextResponse.json(resultado.turno, { headers: noStore });
  } catch (error) {
    console.error("No se pudo llamar al siguiente turno:", error);
    return NextResponse.json(
      { error: "No se pudo llamar al siguiente turno" },
      { status: 500 },
    );
  }
}
