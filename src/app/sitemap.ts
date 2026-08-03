import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  const properties = await prisma.property.findMany({
    where: {
      status: { in: ["AVAILABLE", "RESERVED"] },
      publishedAt: { not: null },
      organization: {
        billingStatus: { in: ["ACTIVE", "EXEMPT"] },
      },
    },
    select: { slug: true, updatedAt: true },
  });

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/propiedades`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...properties.map((p) => ({
      url: `${base}/propiedades/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
