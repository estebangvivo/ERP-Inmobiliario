import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, DataTable, ListPagination } from "@/components/erp/page-chrome";
import {
  clampListPage,
  paginateArray,
  parseListPage,
  parseListPageSize,
} from "@/lib/list-pagination";
import { ComplexForm } from "@/components/erp/complex-form";
import { UnitForm } from "@/components/erp/unit-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";

type Params = Promise<{ id: string }>;

export default async function ComplejoDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ unitsPage?: string; pageSize?: string }>;
}) {
  const session = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const pageSize = parseListPageSize(sp.pageSize);
  const listParams = {
    pageSize: pageSize !== 10 ? String(pageSize) : undefined,
  };

  const [complex, linkableProperties] = await Promise.all([
    prisma.complex.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        units: {
          include: { property: true },
          orderBy: { code: "asc" },
        },
        expenses: {
          take: 3,
          orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        },
      },
    }),
    prisma.property.findMany({
      where: {
        organizationId: session.organizationId,
        unitId: null,
        propertyType: { in: ["APARTMENT", "OFFICE", "COMMERCIAL"] },
      },
      select: {
        id: true,
        title: true,
        address: true,
        city: true,
        propertyType: true,
        areaM2: true,
        rooms: true,
      },
      orderBy: [{ city: "asc" }, { title: "asc" }],
    }),
  ]);
  if (!complex) notFound();

  const unitsPage = clampListPage(
    parseListPage(sp.unitsPage),
    complex.units.length,
    pageSize,
  );
  const unitsSlice = paginateArray(complex.units, unitsPage, pageSize);

  return (
    <div className="space-y-8">
      <PageHeader
        title={complex.name}
        description={`${complex.address}, ${complex.city}`}
        actions={
          <Link href="/expensas">
            <Button>Cargar expensas</Button>
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expensas de este edificio</CardTitle>
          <CardDescription>
            El monto total se carga en el módulo Expensas y se prorratea
            automáticamente a cada unidad según sus metros cuadrados sobre el
            total del edificio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {complex.expenses.length === 0 ? (
            <p className="text-[var(--muted-foreground)]">
              Todavía no hay expensas cargadas.{" "}
              <Link href="/expensas" className="text-[var(--primary)] underline">
                Ir a Expensas
              </Link>
            </p>
          ) : (
            complex.expenses.map((e) => (
              <p key={e.id}>
                {e.periodMonth}/{e.periodYear} · {e.concept} ·{" "}
                {e.type === "ORDINARY" ? "Ordinaria" : "Extraordinaria"}
              </p>
            ))
          )}
        </CardContent>
      </Card>

      <ComplexForm
        mode="edit"
        complex={{
          id: complex.id,
          name: complex.name,
          address: complex.address,
          city: complex.city,
          province: complex.province,
          description: complex.description,
        }}
      />

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Unidades</h3>
        <UnitForm
          complexId={complex.id}
          properties={linkableProperties.map((p) => ({
            id: p.id,
            title: p.title,
            address: p.address,
            city: p.city,
            propertyType: p.propertyType,
            areaM2: p.areaM2?.toString() ?? null,
            rooms: p.rooms,
          }))}
        />
        <DataTable
          headers={["Código", "Piso", "Coeficiente", "m²", "Ambientes", "Propiedad"]}
          empty={complex.units.length === 0}
        >
          {unitsSlice.items.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-medium">{u.code}</td>
              <td className="px-4 py-3">{u.floor ?? "—"}</td>
              <td className="px-4 py-3">{u.ownershipCoefficient.toString()}</td>
              <td className="px-4 py-3">{u.areaM2?.toString() ?? "—"}</td>
              <td className="px-4 py-3">{u.rooms ?? "—"}</td>
              <td className="px-4 py-3">
                {u.property ? (
                  <Link
                    href={`/gestion/propiedades/${u.property.id}`}
                    className="inline-flex"
                  >
                    <Badge variant="success">{u.property.title}</Badge>
                  </Link>
                ) : (
                  <Badge variant="outline">Sin vincular</Badge>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
        <ListPagination
          page={unitsPage}
          pageSize={pageSize}
          total={complex.units.length}
          params={listParams}
          pageKey="unitsPage"
        />
      </section>
    </div>
  );
}
