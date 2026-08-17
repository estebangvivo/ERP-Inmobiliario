import Link from "next/link";
import type { Currency } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/erp/page-chrome";
import { formatDate, formatDateOnly } from "@/lib/dates";
import {
  CONTRACT_STATUS_LABELS,
  SALE_DEAL_STAGE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type {
  HistoryContractRow,
  HistoryEvent,
  HistoryOwnerRow,
  HistoryParty,
  HistoryRentPriceRow,
  HistorySaleRow,
  HistoryWorkOrderRow,
} from "@/server/queries/history";

export function PersonNameLink({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <Link
      href={`/personas/${id}`}
      className="text-[var(--primary)] hover:underline"
    >
      {name}
    </Link>
  );
}

export function PropertyHistoryLink({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  return (
    <Link
      href={`/gestion/propiedades/${id}/historial`}
      className="text-[var(--primary)] hover:underline"
    >
      {title}
    </Link>
  );
}

function money(amount: string, currency: Currency) {
  return formatMoney(amount, currency);
}

function partiesByRole(parties: HistoryParty[], role: HistoryParty["role"]) {
  return parties.filter((p) => p.role === role);
}

function contractStatusBadge(status: HistoryContractRow["status"]) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "TERMINATED") return "danger" as const;
  if (status === "EXPIRED") return "warning" as const;
  return "secondary" as const;
}

export function HistoryTimeline({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Línea de tiempo</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4 border-l border-[var(--border)] pl-4">
          {events.slice(0, 40).map((e, i) => (
            <li key={`${e.at.toISOString()}-${e.title}-${i}`} className="relative">
              <span className="absolute -left-[1.3125rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
              <p className="text-xs tabular-nums text-[var(--muted-foreground)]">
                {formatDate(e.at)}
              </p>
              {e.href ? (
                <Link
                  href={e.href}
                  className="font-medium text-[var(--primary)] hover:underline"
                >
                  {e.title}
                </Link>
              ) : (
                <p className="font-medium">{e.title}</p>
              )}
              <p className="text-sm text-[var(--muted-foreground)]">{e.detail}</p>
            </li>
          ))}
        </ol>
        {events.length > 40 ? (
          <p className="mt-4 text-xs text-[var(--muted-foreground)]">
            Se muestran los 40 eventos más recientes.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function HistoryContractsTable({
  rows,
  showProperty,
}: {
  rows: HistoryContractRow[];
  showProperty?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Contratos de alquiler</h3>
      <DataTable
          headers={[
            "Contrato",
            ...(showProperty ? ["Propiedad"] : []),
            "Período",
            "Inquilino",
            "Propietario",
            "Alquiler",
            "Cuotas",
            "",
          ]}
          empty={rows.length === 0}
        >
          {rows.map((c) => {
            const tenants = partiesByRole(c.parties, "TENANT");
            const owners = partiesByRole(c.parties, "OWNER");
            return (
              <tr key={c.id} className="hover:bg-[var(--muted)]/40">
                <td className="px-4 py-3">
                  <p className="font-medium">{c.code}</p>
                  <Badge variant={contractStatusBadge(c.status)}>
                    {CONTRACT_STATUS_LABELS[c.status]}
                  </Badge>
                </td>
                {showProperty ? (
                  <td className="px-4 py-3">
                    <PropertyHistoryLink id={c.propertyId} title={c.propertyTitle} />
                  </td>
                ) : null}
                <td className="px-4 py-3 text-sm tabular-nums">
                  {formatDateOnly(c.startDate)} – {formatDateOnly(c.endDate)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {tenants.length === 0
                    ? "—"
                    : tenants.map((p) => (
                        <span key={p.userId} className="block">
                          <PersonNameLink id={p.userId} name={p.name} />
                        </span>
                      ))}
                </td>
                <td className="px-4 py-3 text-sm">
                  {owners.length === 0
                    ? "—"
                    : owners.map((p) => (
                        <span key={p.userId} className="block">
                          <PersonNameLink id={p.userId} name={p.name} />
                        </span>
                      ))}
                </td>
                <td className="px-4 py-3 text-sm">
                  <p className="font-medium">{money(c.currentRent, c.currency)}</p>
                  {c.currentRent !== c.initialRent ? (
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Inicial {money(c.initialRent, c.currency)}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                  {c.billsPaid} pagadas
                  {c.billsPending > 0 ? ` · ${c.billsPending} abiertas` : ""}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/contratos/${c.id}`}>
                    <Button size="sm" variant="outline">
                      Ver
                    </Button>
                  </Link>
                </td>
              </tr>
            );
          })}
        </DataTable>
    </section>
  );
}

export function HistoryRentPricesTable({ rows }: { rows: HistoryRentPriceRow[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Precios históricos de alquiler</h3>
      <DataTable
          headers={["Fecha", "Contrato", "Concepto", "Monto"]}
          empty={rows.length === 0}
        >
          {rows.map((r, i) => (
            <tr key={`${r.contractId}-${r.at.toISOString()}-${i}`}>
              <td className="px-4 py-3 tabular-nums text-[var(--muted-foreground)]">
                {formatDateOnly(r.at)}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/contratos/${r.contractId}`}
                  className="text-[var(--primary)] hover:underline"
                >
                  {r.contractCode}
                </Link>
              </td>
              <td className="px-4 py-3">{r.label}</td>
              <td className="px-4 py-3 font-medium">{money(r.amount, r.currency)}</td>
            </tr>
          ))}
        </DataTable>
    </section>
  );
}

export function HistorySalesTable({
  rows,
  showProperty,
}: {
  rows: HistorySaleRow[];
  showProperty?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Boletos y oportunidades de venta</h3>
      <DataTable
          headers={[
            "Fecha",
            ...(showProperty ? ["Propiedad"] : []),
            "Comprador",
            "Etapa",
            "Oferta / seña",
            "Boleto",
            "",
          ]}
          empty={rows.length === 0}
        >
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-3 tabular-nums text-[var(--muted-foreground)]">
                {formatDate(d.createdAt)}
              </td>
              {showProperty ? (
                <td className="px-4 py-3">
                  <PropertyHistoryLink id={d.propertyId} title={d.propertyTitle} />
                </td>
              ) : null}
              <td className="px-4 py-3">{d.buyerName}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    d.stage === "SOLD"
                      ? "success"
                      : d.stage === "LOST"
                        ? "danger"
                        : "secondary"
                  }
                >
                  {SALE_DEAL_STAGE_LABELS[d.stage]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm">
                {d.offerAmount ? (
                  <p>Oferta {money(d.offerAmount, d.currency)}</p>
                ) : null}
                {d.reservationAmount ? (
                  <p className="text-[var(--muted-foreground)]">
                    Seña {money(d.reservationAmount, d.currency)}
                  </p>
                ) : null}
                {!d.offerAmount && !d.reservationAmount ? "—" : null}
              </td>
              <td className="px-4 py-3 text-sm tabular-nums">
                {d.deedDate ? formatDateOnly(d.deedDate) : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/ventas/${d.id}`}>
                  <Button size="sm" variant="outline">
                    Ver
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
    </section>
  );
}

export function HistoryOwnersTable({ owners }: { owners: HistoryOwnerRow[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Titulares actuales</h3>
      <DataTable
          headers={["Propietario", "Participación", "Desde"]}
          empty={owners.length === 0}
        >
          {owners.map((o) => (
            <tr key={o.userId}>
              <td className="px-4 py-3">
                <PersonNameLink id={o.userId} name={o.name} />
                {o.isPrimary ? (
                  <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                    principal
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">{Number(o.sharePct)}%</td>
              <td className="px-4 py-3 tabular-nums text-[var(--muted-foreground)]">
                {formatDate(o.since)}
              </td>
            </tr>
          ))}
        </DataTable>
    </section>
  );
}

export function HistoryWorkOrdersTable({ rows }: { rows: HistoryWorkOrderRow[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Reclamos y mantenimiento</h3>
      <DataTable
          headers={["Código", "Tema", "Estado", "Fecha"]}
          empty={rows.length === 0}
        >
          {rows.map((w) => (
            <tr key={w.id}>
              <td className="px-4 py-3">
                <Link
                  href={`/mantenimiento/${w.id}`}
                  className="text-[var(--primary)] hover:underline"
                >
                  {w.code}
                </Link>
              </td>
              <td className="px-4 py-3">{w.title}</td>
              <td className="px-4 py-3">
                <Badge variant="secondary">
                  {WORK_ORDER_STATUS_LABELS[w.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 tabular-nums text-[var(--muted-foreground)]">
                {formatDate(w.requestedAt)}
              </td>
            </tr>
          ))}
        </DataTable>
    </section>
  );
}

export function HistorySettlementsTable({
  rows,
}: {
  rows: {
    id: string;
    code: string;
    periodYear: number;
    periodMonth: number;
    netPayout: string;
    currency: Currency;
    status: keyof typeof SETTLEMENT_STATUS_LABELS;
    issuedAt: Date | null;
  }[];
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Rendiciones</h3>
      <DataTable
          headers={["Código", "Período", "Neto", "Estado", "Emitida"]}
          empty={rows.length === 0}
        >
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3">
                <Link
                  href={`/rendiciones/${s.id}`}
                  className="text-[var(--primary)] hover:underline"
                >
                  {s.code}
                </Link>
              </td>
              <td className="px-4 py-3 tabular-nums">
                {String(s.periodMonth).padStart(2, "0")}/{s.periodYear}
              </td>
              <td className="px-4 py-3 font-medium">
                {money(s.netPayout, s.currency)}
              </td>
              <td className="px-4 py-3">
                <Badge variant={s.status === "PAID" ? "success" : "secondary"}>
                  {SETTLEMENT_STATUS_LABELS[s.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 tabular-nums text-[var(--muted-foreground)]">
                {s.issuedAt ? formatDate(s.issuedAt) : "—"}
              </td>
            </tr>
          ))}
        </DataTable>
    </section>
  );
}
