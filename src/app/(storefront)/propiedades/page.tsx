import Link from "next/link";
import type { Metadata } from "next";
import { OperationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicOrganizationPropertyFilter } from "@/lib/tenant-scope";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  OPERATION_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/server/validators/property";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Propiedades en alquiler y venta | ${BRAND_NAME}`,
  description:
    "Catálogo público de propiedades disponibles para alquiler y venta.",
};

type SearchParams = Promise<{
  q?: string;
  operation?: string;
  city?: string;
  rooms?: string;
  minPrice?: string;
  maxPrice?: string;
}>;

export default async function PublicPropiedadesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const operation = params.operation as OperationType | undefined;
  const city = params.city?.trim() ?? "";
  const rooms = params.rooms ? Number(params.rooms) : undefined;
  const minPrice = params.minPrice ? Number(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;

  const orgs = await prisma.organization.findMany({
    where: { billingStatus: { in: ["ACTIVE", "EXEMPT"] } },
    select: { id: true },
  });
  const orgIds = orgs.map((o) => o.id);

  const filters: Prisma.PropertyWhereInput[] = [
    { organizationId: { in: orgIds.length > 0 ? orgIds : ["__none__"] } },
  ];
  if (q) {
    filters.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (operation) {
    filters.push({
      OR: [{ operationType: operation }, { operationType: "BOTH" }],
    });
  }
  if (city) filters.push({ city: { contains: city, mode: "insensitive" } });
  if (rooms) filters.push({ rooms: { gte: rooms } });
  if (minPrice) filters.push({ price: { gte: minPrice } });
  if (maxPrice) filters.push({ price: { lte: maxPrice } });

  const where: Prisma.PropertyWhereInput = {
    status: { in: ["AVAILABLE", "RESERVED"] },
    publishedAt: { not: null },
    AND: filters,
  };

  const properties = await prisma.property.findMany({
    where,
    include: {
      images: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }], take: 1 },
    },
    orderBy: { publishedAt: "desc" },
  });

  const cities = await prisma.property.findMany({
    where: {
      status: { in: ["AVAILABLE", "RESERVED"] },
      publishedAt: { not: null },
      organizationId: { in: orgIds.length > 0 ? orgIds : ["__none__"] },
    },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Propiedades</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {properties.length} resultado{properties.length === 1 ? "" : "s"}
        </p>
      </div>

      <form className="mb-8 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Input name="q" placeholder="Buscar…" defaultValue={q} className="lg:col-span-2" />
        <Select name="operation" defaultValue={operation ?? ""}>
          <option value="">Operación</option>
          <option value="RENT">Alquiler</option>
          <option value="SALE">Venta</option>
        </Select>
        <Select name="city" defaultValue={city}>
          <option value="">Ciudad</option>
          {cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city}
            </option>
          ))}
        </Select>
        <Select name="rooms" defaultValue={params.rooms ?? ""}>
          <option value="">Ambientes</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}+
            </option>
          ))}
        </Select>
        <div className="flex gap-2 lg:col-span-6">
          <Input
            name="minPrice"
            type="number"
            placeholder="Precio mín"
            defaultValue={params.minPrice ?? ""}
          />
          <Input
            name="maxPrice"
            type="number"
            placeholder="Precio máx"
            defaultValue={params.maxPrice ?? ""}
          />
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </div>
      </form>

      {properties.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center text-sm text-[var(--muted-foreground)]">
          No hay propiedades con esos filtros.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => {
            const cover =
              property.images[0]?.url ??
              "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800";
            return (
              <Link
                key={property.id}
                href={`/propiedades/${property.slug}`}
                className="group overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] transition hover:border-[var(--ring)]"
              >
                <div
                  className="aspect-[4/3] bg-cover bg-center transition group-hover:scale-[1.02]"
                  style={{ backgroundImage: `url(${cover})` }}
                />
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {OPERATION_LABELS[property.operationType]}
                    </Badge>
                    <Badge variant="outline">
                      {PROPERTY_TYPE_LABELS[property.propertyType]}
                    </Badge>
                  </div>
                  <h2 className="line-clamp-2 font-semibold leading-snug">
                    {property.title}
                  </h2>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {property.city}
                    {property.rooms ? ` · ${property.rooms} amb.` : ""}
                    {property.areaM2 ? ` · ${property.areaM2} m²` : ""}
                  </p>
                  <p className="text-lg font-semibold text-[var(--primary)]">
                    {formatMoney(property.price.toString(), property.currency)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
