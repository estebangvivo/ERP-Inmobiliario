import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import { PropertyForm } from "@/components/erp/property-form";
import { PropertyImagesManager } from "@/components/erp/property-images-manager";
import { Button } from "@/components/ui/button";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";

type Params = Promise<{ id: string }>;

export default async function EditPropiedadPage({ params }: { params: Params }) {
  const session = await requireStaff();
  const { id } = await params;

  const [property, ownerMembers, units] = await Promise.all([
    prisma.property.findUnique({
      where: { id },
      include: {
        ownerships: true,
        images: {
          omit: { data: true },
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        },
        unit: { include: { complex: true } },
      },
    }),
    prisma.organizationMember.findMany({
      where: {
        organizationId: session.organizationId,
        role: "OWNER",
        user: {
          isActive: true,
          ...excludePlatformSuperadminFromUser(),
        },
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.unit.findMany({
      include: { complex: true, property: true },
      orderBy: [{ complex: { name: "asc" } }, { code: "asc" }],
    }),
  ]);

  if (!property) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Editar · ${property.title}`}
        description={property.slug}
        actions={
          <div className="flex flex-wrap gap-2">
            {property.operationType === "SALE" ||
            property.operationType === "BOTH" ? (
              <Link href={`/ventas?propertyId=${property.id}`}>
                <Button size="sm" variant="outline">
                  Crear oportunidad
                </Button>
              </Link>
            ) : null}
            {property.unit ? (
              <Link href="/expensas">
                <Button size="sm" variant="outline">
                  Cargar expensas ({property.unit.complex.name})
                </Button>
              </Link>
            ) : null}
            <Link href={`/gestion/propiedades/${property.id}/historial`}>
              <Button size="sm">Historial</Button>
            </Link>
          </div>
        }
      />

      <PropertyImagesManager propertyId={property.id} images={property.images} />

      <PropertyForm
        mode="edit"
        owners={ownerMembers.map((m) => m.user)}
        units={units
          .filter((u) => !u.property || u.property.id === property.id)
          .map((u) => ({
            id: u.id,
            label: `${u.complex.name} · ${u.code}`,
          }))}
        property={{
          id: property.id,
          title: property.title,
          description: property.description,
          propertyType: property.propertyType,
          operationType: property.operationType,
          status: property.status,
          price: property.price.toString(),
          rentPrice: property.rentPrice?.toString() ?? null,
          currency: property.currency,
          rentCurrency: property.rentCurrency,
          address: property.address,
          city: property.city,
          province: property.province,
          rooms: property.rooms,
          bathrooms: property.bathrooms,
          areaM2: property.areaM2?.toString() ?? null,
          amenities: property.amenities,
          videoUrl: property.videoUrl,
          unitId: property.unitId,
          ownerId: property.ownerships[0]?.ownerId ?? null,
          coverImageUrl: property.images.find((i) => i.isCover)?.url ?? null,
          listedPublic: property.publishedAt != null,
        }}
      />
    </div>
  );
}
