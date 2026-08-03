import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publicOrganizationPropertyFilter } from "@/lib/tenant-scope";
import { publicPropertyPath } from "@/lib/public-org";

type Params = Promise<{ slug: string }>;

/** Compatibilidad: redirige al portal de la inmobiliaria dueña. */
export default async function LegacyPublicPropertyRedirect({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const property = await prisma.property.findFirst({
    where: {
      slug,
      ...publicOrganizationPropertyFilter(),
    },
    select: {
      slug: true,
      organization: { select: { slug: true } },
    },
  });

  if (!property?.organization) notFound();
  redirect(publicPropertyPath(property.organization.slug, property.slug));
}
