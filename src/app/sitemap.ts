import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import {
  publicPropertiesPath,
  publicPropertyPath,
  publicStorefrontPath,
} from "@/lib/public-org";

/** No pre-render en build: Railway a veces no tiene DATABASE_URL en esa fase. */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"
  ).replace(/\/$/, "");

  const fallback: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  try {
    const orgs = await prisma.organization.findMany({
      where: { billingStatus: { in: ["ACTIVE", "EXEMPT"] } },
      select: { slug: true, updatedAt: true },
    });

    const properties = await prisma.property.findMany({
      where: {
        status: { in: ["AVAILABLE", "RESERVED"] },
        publishedAt: { not: null },
        organization: {
          billingStatus: { in: ["ACTIVE", "EXEMPT"] },
        },
      },
      select: {
        slug: true,
        updatedAt: true,
        organization: { select: { slug: true } },
      },
    });

    return [
      ...fallback,
      ...orgs.flatMap((org) => [
        {
          url: `${base}${publicStorefrontPath(org.slug)}`,
          lastModified: org.updatedAt,
          changeFrequency: "weekly" as const,
          priority: 0.9,
        },
        {
          url: `${base}${publicPropertiesPath(org.slug)}`,
          lastModified: org.updatedAt,
          changeFrequency: "daily" as const,
          priority: 0.9,
        },
      ]),
      ...properties
        .filter((p) => p.organization)
        .map((p) => ({
          url: `${base}${publicPropertyPath(p.organization!.slug, p.slug)}`,
          lastModified: p.updatedAt,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        })),
    ];
  } catch (error) {
    console.error("sitemap: database unavailable during generation", error);
    return fallback;
  }
}
