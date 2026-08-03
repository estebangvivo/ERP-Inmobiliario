import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getPublicOrganization,
  publicPropertyPath,
  publicPropertyWhereForOrg,
} from "@/lib/public-org";
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

type Params = Promise<{ orgSlug: string }>;
type SearchParams = Promise<{
  q?: string;
  operation?: string;
  city?: string;
  rooms?: string;
  minPrice?: string;
  maxPrice?: string;
}>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const org = await getPublicOrganization(orgSlug);
  if (!org) return { title: "Propiedades" };
  return {
    title: `Propiedades | ${org.name} | ${BRAND_NAME}`,
    description: `Catálogo de propiedades de ${org.name}`,
  };
}

export default async function TenantPropiedadesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { orgSlug } = await params;
  const org = await getPublicOrganization(orgSlug);
  if (!org) notFound();

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const operation = sp.operation as OperationType | undefined;
  const city = sp.city?.trim() ?? "";
  const rooms = sp.rooms ? Number(sp.rooms) : undefined;
  const minPrice = sp.minPrice ? Number(sp.minPrice) : undefined;
  const maxPrice = sp.maxPrice ? Number(sp.maxPrice) : undefined;

  const filters: Prisma.PropertyWhereInput[] = [];
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

  const baseWhere = publicPropertyWhereForOrg(org.id);
  const where: Prisma.PropertyWhereInput = filters.length
    ? { ...baseWhere, AND: filters }
    : baseWhere;

  const [properties, cities] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        images: {
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
      },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.property.findMany({
      where: baseWhere,
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Propiedades</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {org.name} · {properties.length} resultado
          {properties.length === 1 ? "" : "s"}
        </p>
      </div>

      <form className="mb-8 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          name="q"
          placeholder="Buscar…"
          defaultValue={q}
          className="lg:col-span-2"
        />
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
        <Select name="rooms" defaultValue={sp.rooms ?? ""}>
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
            defaultValue={sp.minPrice ?? ""}
          />
          <Input
            name="maxPrice"
            type="number"
            placeholder="Precio máx"
            defaultValue={sp.maxPrice ?? ""}
          />
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </div>
      </form>

      {properties.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center text-sm text-[var(--muted-foreground)]">
          No hay propiedades publicadas con esos filtros.
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
                href={publicPropertyPath(org.slug, property.slug)}
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
