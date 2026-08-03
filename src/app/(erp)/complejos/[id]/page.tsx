import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, DataTable } from "@/components/erp/page-chrome";
import { ComplexForm } from "@/components/erp/complex-form";
import { UnitForm } from "@/components/erp/unit-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";

type Params = Promise<{ id: string }>;

export default async function ComplejoDetailPage({ params }: { params: Params }) {
  await requireStaff();
  const { id } = await params;

  const complex = await prisma.complex.findUnique({
    where: { id },
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
  });
  if (!complex) notFound();

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
          <CardTitle className="text-base">Expensas de este complejo</CardTitle>
          <CardDescription>
            El monto total se carga en el módulo Expensas y se prorratea
            automáticamente a cada unidad según su coeficiente.
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
        <UnitForm complexId={complex.id} />
        <DataTable
          headers={["Código", "Piso", "Coeficiente", "m²", "Ambientes", "Propiedad"]}
          empty={complex.units.length === 0}
        >
          {complex.units.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-medium">{u.code}</td>
              <td className="px-4 py-3">{u.floor ?? "—"}</td>
              <td className="px-4 py-3">{u.ownershipCoefficient.toString()}</td>
              <td className="px-4 py-3">{u.areaM2?.toString() ?? "—"}</td>
              <td className="px-4 py-3">{u.rooms ?? "—"}</td>
              <td className="px-4 py-3">
                {u.property ? (
                  <Badge variant="success">{u.property.title}</Badge>
                ) : (
                  <Badge variant="outline">Sin publicar</Badge>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
