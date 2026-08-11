import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationSession } from "@/lib/auth";

type Params = Promise<{ id: string }>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canShowPublicly(property: {
  publishedAt: Date | null;
  status: string;
}) {
  return (
    property.publishedAt != null &&
    (property.status === "AVAILABLE" || property.status === "RESERVED")
  );
}

async function fileFromUploads(url: string) {
  if (!url.startsWith("/uploads/")) return null;
  const filePath = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Params },
) {
  const { id } = await params;
  const image = await prisma.propertyImage.findUnique({
    where: { id },
    select: {
      id: true,
      url: true,
      contentType: true,
      data: true,
      property: {
        select: {
          publishedAt: true,
          status: true,
        },
      },
    },
  });

  if (!image) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!canShowPublicly(image.property)) {
    const session = await getOrganizationSession().catch(() => null);
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const bytes = image.data
    ? Buffer.from(image.data)
    : await fileFromUploads(image.url);

  if (!bytes) {
    return new NextResponse("Image missing; re-upload the photo", {
      status: 404,
    });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": image.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
