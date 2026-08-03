import { NextResponse } from "next/server";
import { getOrganizationSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Sirve el logo de la org desde la DB (data URL).
 * Evita depender de /uploads en el filesystem efímero de Railway.
 */
export async function GET() {
  const session = await getOrganizationSession().catch(() => null);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { logoUrl: true },
  });

  const logoUrl = org?.logoUrl;
  if (!logoUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (logoUrl.startsWith("data:")) {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(
      logoUrl.split("?")[0] ?? logoUrl,
    );
    if (!match) {
      return new NextResponse("Invalid logo", { status: 422 });
    }
    const contentType = match[1];
    const bytes = Buffer.from(match[2], "base64");
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // Legado /uploads: en Railway suele no existir el archivo
  if (logoUrl.startsWith("/uploads/")) {
    return new NextResponse("Logo file missing; re-upload in Settings", {
      status: 404,
    });
  }

  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    return NextResponse.redirect(logoUrl);
  }

  return new NextResponse("Not found", { status: 404 });
}
