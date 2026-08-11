import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPublicOrganization,
  publicPropertyWhereForOrg,
} from "@/lib/public-org";

type Params = Promise<{ orgSlug: string }>;

function absoluteUrl(origin: string, url: string | null | undefined) {
  if (!url) return null;
  const publicOrigin =
    process.env.APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    origin;

  if (url.startsWith("/")) return `${publicOrigin}${url}`;

  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === "0.0.0.0" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1"
    ) {
      return `${publicOrigin}${parsed.pathname}${parsed.search}`;
    }
    return url;
  } catch {
    return url;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Params },
) {
  const { orgSlug } = await params;
  const org = await getPublicOrganization(orgSlug);
  if (!org) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const properties = await prisma.property.findMany({
    where: publicPropertyWhereForOrg(org.id),
    include: {
      images: {
        omit: { data: true },
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  const payload = {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      phone: org.phone,
      email: org.email,
      whatsapp: org.whatsapp,
      city: org.city,
      logoUrl: absoluteUrl(origin, org.logoUrl),
    },
    properties: properties.map((property) => {
      const images = property.images.map((img) => ({
        id: img.id,
        url: absoluteUrl(origin, img.url)!,
        alt: img.alt,
        isCover: img.isCover,
      }));
      const cover =
        images.find((i) => i.isCover)?.url ??
        images[0]?.url ??
        null;

      return {
        id: property.id,
        slug: property.slug,
        title: property.title,
        description: property.description,
        propertyType: property.propertyType,
        operationType: property.operationType,
        status: property.status,
        price: Number(property.price),
        rentPrice: property.rentPrice != null ? Number(property.rentPrice) : null,
        currency: property.currency,
        rentCurrency: property.rentCurrency,
        address: property.address,
        city: property.city,
        province: property.province,
        rooms: property.rooms,
        bathrooms: property.bathrooms,
        areaM2: property.areaM2 ? Number(property.areaM2) : null,
        amenities: property.amenities,
        publishedAt: property.publishedAt,
        coverImage: cover,
        images,
      };
    }),
  };

  return NextResponse.json(payload, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
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
