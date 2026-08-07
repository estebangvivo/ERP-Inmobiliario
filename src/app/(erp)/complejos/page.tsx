import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { complexScopeWhere } from "@/lib/tenant-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, FilterBar, PageHeader } from "@/components/erp/page-chrome";

type SearchParams = Promise<{ q?: string }>;

export default async function ComplejosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("complejos");
  const staff = isStaffRole(session.organizationRole);
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const scope = complexScopeWhere(session);
  const where: Prisma.ComplexWhereInput = {
    AND: [
      scope,
      query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { address: { contains: query, mode: "insensitive" } },
              { city: { contains: query, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const complexes = await prisma.complex.findMany({
    where,
    include: { _count: { select: { units: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Edificios"
        description="Edificios y unidades; las expensas se prorratean por m²."
        actions={
          staff ? (
            <Link href="/complejos/nuevo">
              <Button>Nuevo edificio</Button>
            </Link>
          ) : undefined
        }
      />
      <FilterBar className="lg:grid-cols-3">
        <Input name="q" placeholder="Buscar edificio" defaultValue={query} />
        <Button type="submit" variant="secondary">Filtrar</Button>
      </FilterBar>
      <DataTable
        headers={["Nombre", "Dirección", "Ciudad", "Unidades", ""]}
        empty={complexes.length === 0}
      >
        {complexes.map((c) => (
          <tr key={c.id} className="hover:bg-[var(--muted)]/40">
            <td className="px-4 py-3 font-medium">{c.name}</td>
            <td className="px-4 py-3 text-[var(--muted-foreground)]">{c.address}</td>
            <td className="px-4 py-3">{c.city}</td>
            <td className="px-4 py-3">{c._count.units}</td>
            <td className="px-4 py-3 text-right">
              <Link href={`/complejos/${c.id}`}>
                <Button size="sm" variant="outline">Ver</Button>
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
