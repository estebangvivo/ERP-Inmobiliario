import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import {
  HistoryContractsTable,
  HistoryRentPricesTable,
  HistorySalesTable,
  HistorySettlementsTable,
  HistoryTimeline,
  PropertyHistoryLink,
} from "@/components/erp/history-sections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/erp/page-chrome";
import { formatDate } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/labels";
import { requireSession, isStaffRole } from "@/lib/session";
import { getPersonHistory } from "@/server/queries/history";
import { STATUS_LABELS } from "@/server/validators/property";
import type { OrganizationRole } from "@prisma/client";

type Params = Promise<{ id: string }>;

export default async function PersonHistoryPage({
  params,
}: {
  params: Params;
}) {
  const session = await requireSession();
  const { id } = await params;
  const history = await getPersonHistory(session, id);
  if (!history) notFound();

  const { person } = history;
  const staff = isStaffRole(session.organizationRole);
  const role = person.role as OrganizationRole | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Historial · ${person.name}`}
        description={
          person.documentNumber
            ? `${person.documentType ?? "DNI"} ${person.documentNumber}`
            : person.email
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {staff && history.properties.length > 0 ? (
              <Link href={`/tesoreria/cuentas/propietarios/${person.id}`}>
                <Button size="sm" variant="outline">
                  Cuenta propietario
                </Button>
              </Link>
            ) : null}
            {staff &&
            history.contracts.some((c) =>
              c.parties.some((p) => p.userId === person.id && p.role === "TENANT"),
            ) ? (
              <Link href={`/cobros/cuenta-corriente/${person.id}`}>
                <Button size="sm" variant="outline">
                  Cuenta inquilino
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Persona</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-[var(--muted-foreground)]">Alta: </span>
              {formatDate(person.createdAt)}
            </p>
            {role ? (
              <p className="flex items-center gap-2">
                <span className="text-[var(--muted-foreground)]">Rol: </span>
                <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
              </p>
            ) : null}
            <p>
              <span className="text-[var(--muted-foreground)]">Estado: </span>
              {person.isActive ? "Activo" : "Inactivo"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{person.email}</p>
            {person.phone ? <p>{person.phone}</p> : null}
            {person.documentNumber ? (
              <p>
                {person.documentType ?? "Doc."} {person.documentNumber}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{history.properties.length} propiedades a su nombre</p>
            <p>{history.contracts.length} contratos</p>
            {history.settlements.length > 0 ? (
              <p>{history.settlements.length} rendiciones recientes</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <HistoryTimeline events={history.events} />

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Propiedades</h3>
        <DataTable
            headers={["Propiedad", "Dirección", "Estado", "Participación", "Desde"]}
            empty={history.properties.length === 0}
          >
            {history.properties.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <PropertyHistoryLink id={p.id} title={p.title} />
                </td>
                <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                  {p.address}, {p.city}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">{STATUS_LABELS[p.status]}</Badge>
                </td>
                <td className="px-4 py-3">
                  {Number(p.sharePct)}%{p.isPrimary ? " · principal" : ""}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--muted-foreground)]">
                  {formatDate(p.since)}
                </td>
              </tr>
            ))}
          </DataTable>
      </section>

      <HistoryContractsTable rows={history.contracts} showProperty />
      {history.rentPrices.length > 0 ? (
        <HistoryRentPricesTable rows={history.rentPrices} />
      ) : null}
      {history.saleDeals.length > 0 ? (
        <HistorySalesTable rows={history.saleDeals} showProperty />
      ) : null}
      {history.settlements.length > 0 ? (
        <HistorySettlementsTable rows={history.settlements} />
      ) : null}
    </div>
  );
}
