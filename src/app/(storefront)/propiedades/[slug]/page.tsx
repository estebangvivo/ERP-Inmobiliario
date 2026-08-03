import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { publicOrganizationPropertyFilter } from "@/lib/tenant-scope";
import { Badge } from "@/components/ui/badge";
import { LeadForm } from "@/components/storefront/lead-form";
import { PropertyGallery } from "@/components/storefront/property-gallery";
import {
  OPERATION_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/server/validators/property";
import { PROPERTY_STATUS_LABELS } from "@/lib/labels";

type Params = Promise<{ slug: string }>;

const publicPropertyWhere = (slug: string): Prisma.PropertyWhereInput => ({
  slug,
  ...publicOrganizationPropertyFilter(),
});

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const property = await prisma.property.findFirst({
    where: publicPropertyWhere(slug),
    select: { title: true, description: true, city: true },
  });
  if (!property) return { title: "Propiedad no encontrada" };
  return {
    title: `${property.title} | ERP Inmobiliario`,
    description:
      property.description?.slice(0, 150) ??
      `${property.title} en ${property.city}`,
  };
}

export default async function PublicPropertyDetailPage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const property = await prisma.property.findFirst({
    where: publicPropertyWhere(slug),
    include: {
      images: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] },
      unit: { include: { complex: true } },
    },
  });

  if (!property) notFound();

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1.4fr_0.8fr]">
      <div className="space-y-6">
        <PropertyGallery images={property.images} title={property.title} />

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {OPERATION_LABELS[property.operationType]}
            </Badge>
            <Badge variant="outline">
              {PROPERTY_TYPE_LABELS[property.propertyType]}
            </Badge>
            <Badge variant="success">{PROPERTY_STATUS_LABELS[property.status]}</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {property.title}
          </h1>
          <p className="text-[var(--muted-foreground)]">
            {property.address}, {property.city}
            {property.province ? `, ${property.province}` : ""}
            {property.unit
              ? ` · ${property.unit.complex.name} ${property.unit.code}`
              : ""}
          </p>
          <p className="text-3xl font-semibold text-[var(--primary)]">
            {formatMoney(property.price.toString(), property.currency)}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-4">
          <Spec label="Ambientes" value={property.rooms?.toString() ?? "—"} />
          <Spec label="Baños" value={property.bathrooms?.toString() ?? "—"} />
          <Spec
            label="Superficie"
            value={property.areaM2 ? `${property.areaM2} m²` : "—"}
          />
          <Spec
            label="Amenities"
            value={property.amenities.length ? property.amenities.join(", ") : "—"}
          />
        </dl>

        {property.description ? (
          <div className="prose max-w-none">
            <h2 className="text-lg font-semibold">Descripción</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted-foreground)]">
              {property.description}
            </p>
          </div>
        ) : null}

        {property.videoUrl ? (
          <a
            href={property.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-[var(--primary)] underline"
          >
            Ver video tour
          </a>
        ) : null}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <LeadForm propertyId={property.id} propertyTitle={property.title} />
      </aside>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
