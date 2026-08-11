import Link from "next/link";
import { OperationType, PropertyStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { propertyScopeWhere } from "@/lib/tenant-scope";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable, FilterBar, PageHeader } from "@/components/erp/page-chrome";
import {
  OPERATION_LABELS,
  PROPERTY_TYPE_LABELS,
  STATUS_LABELS,
} from "@/server/validators/property";
import { PropertyPublicToggle } from "@/components/erp/property-public-toggle";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  operationType?: string;
  portal?: string;
}>;

export default async function PropiedadesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("propiedades");
  const staff = isStaffRole(session.organizationRole);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status as PropertyStatus | undefined;
  const operationType = params.operationType as OperationType | undefined;
  const portal = params.portal === "si" || params.portal === "no" ? params.portal : "";

  const scope = propertyScopeWhere(session);
  const where: Prisma.PropertyWhereInput = {
    AND: [
      scope,
      q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { address: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      status ? { status } : {},
      operationType ? { operationType } : {},
      portal === "si"
        ? { publishedAt: { not: null } }
        : portal === "no"
          ? { publishedAt: null }
          : {},
    ],
  };

  const properties = await prisma.property.findMany({
    where,
    include: {
      ownerships: { include: { owner: true }, take: 1 },
      unit: { include: { complex: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Propiedades"
        description="Portfolio de alquiler y venta."
        actions={
          staff ? (
            <Link href="/gestion/propiedades/nueva">
              <Button>Nueva propiedad</Button>
            </Link>
          ) : undefined
        }
      />

      <FilterBar>
        <Input name="q" placeholder="Buscar título, dirección o ciudad" defaultValue={q} />
        <Select name="status" defaultValue={status ?? ""}>
          <option value="">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as PropertyStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Select name="operationType" defaultValue={operationType ?? ""}>
          <option value="">Todas las operaciones</option>
          {(Object.keys(OPERATION_LABELS) as OperationType[]).map((o) => (
            <option key={o} value={o}>{OPERATION_LABELS[o]}</option>
          ))}
        </Select>
        <Select name="portal" defaultValue={portal}>
          <option value="">Portal: todas</option>
          <option value="si">En el portal</option>
          <option value="no">No publicadas</option>
        </Select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </FilterBar>

      <DataTable
        headers={["Propiedad", "Tipo", "Operación", "Precio", "Estado", "Portal", "Propietario", ""]}
        empty={properties.length === 0}
      >
        {properties.map((property) => (
          <tr key={property.id} className="hover:bg-[var(--muted)]/40">
            <td className="px-4 py-3">
              <p className="font-medium">{property.title}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {property.address}, {property.city}
                {property.unit ? ` · ${property.unit.complex.name} ${property.unit.code}` : ""}
              </p>
            </td>
            <td className="px-4 py-3">{PROPERTY_TYPE_LABELS[property.propertyType]}</td>
            <td className="px-4 py-3">{OPERATION_LABELS[property.operationType]}</td>
            <td className="px-4 py-3 font-medium">
              {formatMoney(property.price.toString(), property.currency)}
            </td>
            <td className="px-4 py-3">
              <Badge variant={property.status === "AVAILABLE" ? "success" : "secondary"}>
                {STATUS_LABELS[property.status]}
              </Badge>
            </td>
            <td className="px-4 py-3">
              {staff ? (
                <PropertyPublicToggle
                  propertyId={property.id}
                  listedPublic={property.publishedAt != null}
                />
              ) : property.publishedAt ? (
                <Badge variant="success">En portal</Badge>
              ) : (
                <span className="text-xs text-[var(--muted-foreground)]">No</span>
              )}
            </td>
            <td className="px-4 py-3 text-[var(--muted-foreground)]">
              {property.ownerships[0]?.owner.name ?? "—"}
            </td>
            <td className="px-4 py-3 text-right">
              {staff ? (
                <Link href={`/gestion/propiedades/${property.id}`}>
                  <Button size="sm" variant="outline">Editar</Button>
                </Link>
              ) : (
                <Link href={`/contratos?property=${property.id}`}>
                  <Button size="sm" variant="outline">Ver</Button>
                </Link>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
