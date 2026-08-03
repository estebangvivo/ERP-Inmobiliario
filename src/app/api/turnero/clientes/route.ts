import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTurneroOrg } from "@/features/turnero/lib/api-auth";
import { normalizarDni, normalizarNombre } from "@/features/turnero/lib/clientes";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

/** Busca un cliente por DNI dentro de la organización de la sesión. */
export async function GET(request: NextRequest) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const dni = normalizarDni(request.nextUrl.searchParams.get("dni") ?? "");
  if (!dni) {
    return NextResponse.json(
      { error: "Ingrese un DNI válido (7 u 8 dígitos)" },
      { status: 400, headers: noStore },
    );
  }

  const cliente = await prisma.turneroCliente.findUnique({
    where: { organizationId_dni: { organizationId: session.organizationId, dni } },
  });
  if (!cliente) {
    return NextResponse.json(
      { encontrado: false, dni },
      { status: 404, headers: noStore },
    );
  }

  return NextResponse.json(
    { encontrado: true, cliente },
    { headers: noStore },
  );
}

/**
 * Login / registro:
 * - Si el DNI existe en la organización, inicia sesión.
 * - Si no existe, requiere nombre y lo registra.
 */
export async function POST(request: NextRequest) {
  const session = await requireTurneroOrg();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      dni?: unknown;
      nombre?: unknown;
    };

    const dni = normalizarDni(body.dni);
    if (!dni) {
      return NextResponse.json(
        { error: "Ingrese un DNI válido (7 u 8 dígitos)" },
        { status: 400 },
      );
    }

    const existente = await prisma.turneroCliente.findUnique({
      where: { organizationId_dni: { organizationId: session.organizationId, dni } },
    });
    if (existente) {
      return NextResponse.json({ cliente: existente, nuevo: false });
    }

    const nombre = normalizarNombre(body.nombre);
    if (!nombre) {
      return NextResponse.json(
        {
          error: "Ingrese su nombre completo",
          requiereNombre: true,
          dni,
        },
        { status: 422 },
      );
    }

    const cliente = await prisma.turneroCliente.create({
      data: { organizationId: session.organizationId, dni, nombre },
    });

    return NextResponse.json({ cliente, nuevo: true }, { status: 201 });
  } catch (error) {
    console.error("No se pudo registrar el cliente:", error);
    return NextResponse.json(
      { error: "No se pudo completar el registro" },
      { status: 500 },
    );
  }
}
