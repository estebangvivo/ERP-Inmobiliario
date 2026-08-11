import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPublicOrganization,
  publicPropertyWhereForOrg,
} from "@/lib/public-org";

type Params = Promise<{ orgSlug: string; slug: string }>;

function absoluteUrl(origin: string, url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${origin}${url}`;
  return url;
}

export async function GET(
  request: Request,
  { params }: { params: Params },
) {
  const { orgSlug, slug } = await params;
  const org = await getPublicOrganization(orgSlug);
  if (!org) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const property = await prisma.property.findFirst({
    where: {
      ...publicPropertyWhereForOrg(org.id),
      slug,
    },
    include: {
      images: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
      },
    },
  });

  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const images = property.images.map((img) => ({
    id: img.id,
    url: absoluteUrl(origin, img.url)!,
    alt: img.alt,
    isCover: img.isCover,
  }));

  return NextResponse.json(
    {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      property: {
        id: property.id,
        slug: property.slug,
        title: property.title,
        description: property.description,
        propertyType: property.propertyType,
        operationType: property.operationType,
        status: property.status,
        price: Number(property.price),
        currency: property.currency,
        address: property.address,
        city: property.city,
        province: property.province,
        rooms: property.rooms,
        bathrooms: property.bathrooms,
        areaM2: property.areaM2 ? Number(property.areaM2) : null,
        amenities: property.amenities,
        publishedAt: property.publishedAt,
        coverImage:
          images.find((i) => i.isCover)?.url ?? images[0]?.url ?? null,
        images,
      },
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
