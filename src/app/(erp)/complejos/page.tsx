import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { complexScopeWhere } from "@/lib/tenant-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, FilterBar, ListPagination, PageHeader } from "@/components/erp/page-chrome";
import {
  clampListPage,
  parseListPage,
  parseListPageSize,
  prismaSkipTake,
} from "@/lib/list-pagination";

type SearchParams = Promise<{ q?: string; page?: string; pageSize?: string }>;

export default async function ComplejosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("complejos");
  const staff = isStaffRole(session.organizationRole);
  const { q, page: pageRaw, pageSize: pageSizeRaw } = await searchParams;
  const query = q?.trim() ?? "";
  const pageSize = parseListPageSize(pageSizeRaw);
  const listParams = {
    q: query || undefined,
    pageSize: pageSize !== 10 ? String(pageSize) : undefined,
  };

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

  const total = await prisma.complex.count({ where });
  const page = clampListPage(parseListPage(pageRaw), total, pageSize);
  const complexes = await prisma.complex.findMany({
    where,
    include: { _count: { select: { units: true } } },
    orderBy: { name: "asc" },
    ...prismaSkipTake(page, pageSize),
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
        empty={total === 0}
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
      <ListPagination
        page={page}
        pageSize={pageSize}
        total={total}
        params={listParams}
      />
    </div>
  );
}
