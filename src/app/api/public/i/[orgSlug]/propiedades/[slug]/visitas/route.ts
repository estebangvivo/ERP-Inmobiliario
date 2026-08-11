import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPublicOrganization,
  publicPropertyWhereForOrg,
} from "@/lib/public-org";
import {
  bookPropertyVisit,
  getAvailableVisitDays,
} from "@/server/actions/visit-bookings";

type Params = Promise<{ orgSlug: string; slug: string }>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function resolvePublicProperty(orgSlug: string, slug: string) {
  const org = await getPublicOrganization(orgSlug);
  if (!org) return null;

  const property = await prisma.property.findFirst({
    where: {
      ...publicPropertyWhereForOrg(org.id),
      slug,
    },
    select: { id: true, title: true, slug: true },
  });

  if (!property) return null;
  return { org, property };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** Turnos libres según agenda ERP (excluye RESERVED). */
export async function GET(
  _request: Request,
  { params }: { params: Params },
) {
  const { orgSlug, slug } = await params;
  const resolved = await resolvePublicProperty(orgSlug, slug);
  if (!resolved) {
    return NextResponse.json(
      { error: "Propiedad no encontrada" },
      { status: 404, headers: corsHeaders },
    );
  }

  const days = await getAvailableVisitDays(resolved.property.id);

  return NextResponse.json(
    {
      propertyId: resolved.property.id,
      propertyTitle: resolved.property.title,
      days,
    },
    {
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
      },
    },
  );
}

/** Reserva una visita en un slot disponible. */
export async function POST(
  request: Request,
  { params }: { params: Params },
) {
  const { orgSlug, slug } = await params;
  const resolved = await resolvePublicProperty(orgSlug, slug);
  if (!resolved) {
    return NextResponse.json(
      { error: "Propiedad no encontrada" },
      { status: 404, headers: corsHeaders },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400, headers: corsHeaders },
    );
  }

  const result = await bookPropertyVisit({
    propertyId: resolved.property.id,
    startsAt: String(body.startsAt ?? ""),
    name: String(body.name ?? ""),
    email: String(body.email ?? ""),
    phone: body.phone ? String(body.phone) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: 400, headers: corsHeaders },
    );
  }

  return NextResponse.json(result, { headers: corsHeaders });
}
