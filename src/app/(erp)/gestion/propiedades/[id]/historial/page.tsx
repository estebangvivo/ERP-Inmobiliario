import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import {
  HistoryContractsTable,
  HistoryOwnersTable,
  HistoryRentPricesTable,
  HistorySalesTable,
  HistoryTimeline,
  HistoryWorkOrdersTable,
} from "@/components/erp/history-sections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { formatPropertyPrices } from "@/lib/property-prices";
import { requireModule, isStaffRole } from "@/lib/session";
import { getPropertyHistory } from "@/server/queries/history";
import {
  OPERATION_LABELS,
  PROPERTY_TYPE_LABELS,
  STATUS_LABELS,
} from "@/server/validators/property";

type Params = Promise<{ id: string }>;

export default async function PropertyHistoryPage({
  params,
}: {
  params: Params;
}) {
  const session = await requireModule("propiedades");
  const staff = isStaffRole(session.organizationRole);
  const { id } = await params;
  const history = await getPropertyHistory(session, id);
  if (!history) notFound();

  const { property } = history;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Historial · ${property.title}`}
        description={`${property.address}, ${property.city}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {staff ? (
              <Link href={`/gestion/propiedades/${property.id}`}>
                <Button size="sm" variant="outline">
                  Editar
                </Button>
              </Link>
            ) : null}
            <Link href="/gestion/propiedades">
              <Button size="sm" variant="outline">
                Volver
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ficha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-[var(--muted-foreground)]">Alta: </span>
              {formatDate(property.createdAt)}
            </p>
            <p>
              <span className="text-[var(--muted-foreground)]">Tipo: </span>
              {PROPERTY_TYPE_LABELS[property.propertyType]}
            </p>
            <p>
              <span className="text-[var(--muted-foreground)]">Operación: </span>
              {OPERATION_LABELS[property.operationType]}
            </p>
            <p className="flex items-center gap-2">
              <span className="text-[var(--muted-foreground)]">Estado: </span>
              <Badge variant="secondary">{STATUS_LABELS[property.status]}</Badge>
            </p>
            {property.complexName ? (
              <p>
                <span className="text-[var(--muted-foreground)]">Edificio: </span>
                {property.complexName}
                {property.unitCode ? ` · ${property.unitCode}` : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Precios actuales de lista</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {formatPropertyPrices(property)}
            </p>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              El cartel se pisa al editar. El historial de alquiler sale de los
              contratos y ajustes; el de venta, de las oportunidades.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portal</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {property.publishedAt ? (
              <p>
                Publicada el {formatDate(property.publishedAt)}
              </p>
            ) : (
              <p className="text-[var(--muted-foreground)]">
                No está publicada en el portal.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <HistoryTimeline events={history.events} />
      {history.owners.length > 0 ? (
        <HistoryOwnersTable owners={history.owners} />
      ) : null}
      <HistoryContractsTable rows={history.contracts} />
      {history.rentPrices.length > 0 ? (
        <HistoryRentPricesTable rows={history.rentPrices} />
      ) : null}
      {history.saleDeals.length > 0 ? (
        <HistorySalesTable rows={history.saleDeals} />
      ) : null}
      {history.workOrders.length > 0 ? (
        <HistoryWorkOrdersTable rows={history.workOrders} />
      ) : null}
    </div>
  );
}
