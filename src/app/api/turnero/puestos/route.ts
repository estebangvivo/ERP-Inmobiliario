import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTurneroOrg } from "@/features/turnero/lib/api-auth";
import { esCategoria } from "@/features/turnero/lib/turnos";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

function normalizarNombre(value: unknown) {
  if (typeof value !== "string") return null;
  const nombre = value.trim().replace(/\s+/g, " ");
  if (nombre.length < 2 || nombre.length > 80) return null;
  return nombre;
}

export async function GET(request: NextRequest) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const todos = request.nextUrl.searchParams.get("todos") === "1";
  const puestos = await prisma.turneroPuesto.findMany({
    where: todos
      ? { organizationId: session.organizationId }
      : { organizationId: session.organizationId, activo: true },
    orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
  });
  return NextResponse.json(puestos, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      nombre?: unknown;
      categoria?: unknown;
    };

    const nombre = normalizarNombre(body.nombre);
    if (!nombre || !esCategoria(body.categoria)) {
      return NextResponse.json(
        { error: "Nombre o categoría inválidos" },
        { status: 400 },
      );
    }

    const puesto = await prisma.turneroPuesto.create({
      data: {
        organizationId: session.organizationId,
        nombre,
        categoria: body.categoria,
        activo: true,
      },
    });

    return NextResponse.json(puesto, { status: 201, headers: noStore });
  } catch (error) {
    console.error("No se pudo crear el puesto:", error);
    return NextResponse.json(
      { error: "Ya existe un puesto con ese nombre" },
      { status: 409 },
    );
  }
}
