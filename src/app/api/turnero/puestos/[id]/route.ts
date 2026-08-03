import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTurneroOrg } from "@/features/turnero/lib/api-auth";
import { esCategoria } from "@/features/turnero/lib/turnos";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

function normalizarNombre(value: unknown) {
  if (typeof value !== "string") return null;
  const nombre = value.trim().replace(/\s+/g, " ");
  if (nombre.length < 2 || nombre.length > 80) return null;
  return nombre;
}

export async function PATCH(request: NextRequest, { params }: Contexto) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const existente = await prisma.turneroPuesto.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!existente) {
      return NextResponse.json({ error: "Puesto no encontrado" }, { status: 404 });
    }

    const body = (await request.json()) as {
      nombre?: unknown;
      categoria?: unknown;
      activo?: unknown;
    };

    const data: {
      nombre?: string;
      categoria?: string;
      activo?: boolean;
    } = {};

    if (body.nombre !== undefined) {
      const nombre = normalizarNombre(body.nombre);
      if (!nombre) {
        return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
      }
      data.nombre = nombre;
    }

    if (body.categoria !== undefined) {
      if (!esCategoria(body.categoria)) {
        return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
      }
      data.categoria = body.categoria;
    }

    if (body.activo !== undefined) {
      if (typeof body.activo !== "boolean") {
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      }
      data.activo = body.activo;
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }

    const puesto = await prisma.turneroPuesto.update({ where: { id }, data });
    return NextResponse.json(puesto, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("No se pudo actualizar el puesto:", error);
    return NextResponse.json(
      { error: "Puesto no encontrado o nombre duplicado" },
      { status: 404 },
    );
  }
}

export async function DELETE(_: NextRequest, { params }: Contexto) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const existente = await prisma.turneroPuesto.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!existente) {
      return NextResponse.json({ error: "Puesto no encontrado" }, { status: 404 });
    }

    // Baja lógica: conserva historial de turnos asociados por nombre.
    const puesto = await prisma.turneroPuesto.update({
      where: { id },
      data: { activo: false },
    });

    return NextResponse.json(puesto, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("No se pudo eliminar el puesto:", error);
    return NextResponse.json({ error: "Puesto no encontrado" }, { status: 404 });
  }
}
