import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { contractScopeWhere } from "@/lib/tenant-scope";
import { formatMoney } from "@/lib/money";
import {
  formatDateOnly,
  parseDateInput,
  toDateInputValue,
} from "@/lib/dates";
import { CONTRACT_STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import {
  DataTable,
  FilterBar,
  PageHeader,
} from "@/components/erp/page-chrome";
import {
  PersonNameLink,
  PropertyHistoryLink,
} from "@/components/erp/history-sections";

type SearchParams = Promise<{ desde?: string; hasta?: string }>;

function defaultRange(now = new Date()) {
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const to = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 90,
      23,
      59,
      59,
      999,
    ),
  );
  return {
    from,
    to,
    fromInput: toDateInputValue(from),
    toInput: toDateInputValue(to),
  };
}

function resolveRange(desde?: string | null, hasta?: string | null) {
  const fallback = defaultRange();
  const fromParsed = desde ? parseDateInput(desde) : null;
  const toParsed = hasta ? parseDateInput(hasta) : null;
  const from = fromParsed ?? fallback.from;
  let to = toParsed
    ? new Date(
        Date.UTC(
          toParsed.getUTCFullYear(),
          toParsed.getUTCMonth(),
          toParsed.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      )
    : fallback.to;
  if (to < from) {
    to = new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }
  return {
    from,
    to,
    fromInput: toDateInputValue(from),
    toInput: toDateInputValue(to),
  };
}

export default async function ContratosPorVencerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("contratos");
  const staff = isStaffRole(session.organizationRole);
  const params = await searchParams;
  const range = resolveRange(params.desde, params.hasta);

  const where: Prisma.ContractWhereInput = {
    AND: [
      contractScopeWhere(session),
      { status: { in: ["ACTIVE", "EXPIRED"] } },
      { endDate: { gte: range.from, lte: range.to } },
    ],
  };

  const contracts = await prisma.contract.findMany({
    where,
    orderBy: { endDate: "asc" },
    include: {
      property: { select: { id: true, title: true } },
      parties: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Próximos a vencer"
        description="Contratos activos o vencidos cuyo fin cae en el rango elegido. Desde acá podés renovar editando los datos."
        actions={
          <Link href="/contratos">
            <Button variant="outline">Volver a contratos</Button>
          </Link>
        }
      />

      <FilterBar>
        <div className="space-y-1">
          <Label htmlFor="desde" className="text-xs">
            Vence desde
          </Label>
          <DateInput
            id="desde"
            name="desde"
            defaultValue={range.fromInput}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hasta" className="text-xs">
            Vence hasta
          </Label>
          <DateInput
            id="hasta"
            name="hasta"
            defaultValue={range.toInput}
            required
          />
        </div>
        <Button type="submit" variant="secondary" className="self-end">
          Aplicar rango
        </Button>
      </FilterBar>

      <p className="text-sm text-[var(--muted-foreground)]">
        {contracts.length} contrato
        {contracts.length === 1 ? "" : "s"} con fin entre{" "}
        {formatDateOnly(range.from)} y {formatDateOnly(range.to)}.
      </p>

      <DataTable
        headers={[
          "Código",
          "Propiedad",
          "Inquilino",
          "Fin",
          "Alquiler inicial",
          "Estado",
          ...(staff ? [""] : []),
        ]}
        empty={contracts.length === 0}
      >
        {contracts.map((c) => {
          const tenant = c.parties.find((p) => p.role === "TENANT")?.user;
          return (
            <tr key={c.id} className="hover:bg-[var(--muted)]/40">
              <td className="px-4 py-3">
                <Link
                  href={`/contratos/${c.id}`}
                  className="font-medium text-[var(--primary)] hover:underline"
                >
                  {c.code}
                </Link>
              </td>
              <td className="px-4 py-3">
                <PropertyHistoryLink
                  id={c.property.id}
                  title={c.property.title}
                />
              </td>
              <td className="px-4 py-3 text-[var(--muted-foreground)]">
                {tenant ? (
                  <PersonNameLink id={tenant.id} name={tenant.name} />
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">{formatDateOnly(c.endDate)}</td>
              <td className="px-4 py-3">
                {formatMoney(c.initialRent.toString(), c.currency)}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={c.status === "ACTIVE" ? "success" : "secondary"}
                >
                  {CONTRACT_STATUS_LABELS[c.status]}
                </Badge>
              </td>
              {staff ? (
                <td className="px-4 py-3 text-right">
                  <Link href={`/contratos/renovar/${c.id}`}>
                    <Button size="sm">Renovar</Button>
                  </Link>
                </td>
              ) : null}
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
