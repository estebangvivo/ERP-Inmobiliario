import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PUBLIC_BILLING = ["ACTIVE", "EXEMPT"] as const;

export function publicStorefrontPath(orgSlug: string) {
  return `/i/${orgSlug}`;
}

export function publicPropertiesPath(orgSlug: string) {
  return `/i/${orgSlug}/propiedades`;
}

export function publicPropertyPath(orgSlug: string, propertySlug: string) {
  return `/i/${orgSlug}/propiedades/${propertySlug}`;
}

export type PublicOrganization = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
};

export async function getPublicOrganization(
  orgSlug: string,
): Promise<PublicOrganization | null> {
  return prisma.organization.findFirst({
    where: {
      slug: orgSlug,
      billingStatus: { in: [...PUBLIC_BILLING] },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      phone: true,
      email: true,
      whatsapp: true,
      city: true,
    },
  });
}

/** Propiedades visibles en el portal de una empresa. */
export function publicPropertyWhereForOrg(
  organizationId: string,
): Prisma.PropertyWhereInput {
  return {
    organizationId,
    status: { in: ["AVAILABLE", "RESERVED"] },
    publishedAt: { not: null },
  };
}
