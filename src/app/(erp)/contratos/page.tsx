import Link from "next/link";
import { ContractStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { contractScopeWhere } from "@/lib/tenant-scope";
import { formatMoney } from "@/lib/money";
import { formatDateOnly } from "@/lib/dates";
import { CONTRACT_STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable, FilterBar, PageHeader } from "@/components/erp/page-chrome";
import { IndexRatesForm } from "@/components/erp/index-rates-form";
import { IndexRatesLoadedButton } from "@/components/erp/index-rates-loaded";
import { INDEX_PERIOD_OPTIONS, indexRateKey } from "@/lib/index-periods";

type SearchParams = Promise<{ q?: string; status?: string }>;

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("contratos");
  const staff = isStaffRole(session.organizationRole);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status as ContractStatus | undefined;

  const scope = contractScopeWhere(session);
  const where: Prisma.ContractWhereInput = {
    AND: [
      scope,
      status ? { status } : {},
      q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { property: { title: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [contracts, indexRates] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: {
        property: true,
        parties: { include: { user: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    staff
      ? prisma.indexRate.findMany({
          where: { organizationId: session.organizationId },
          orderBy: [
            { periodYear: "desc" },
            { periodMonth: "desc" },
            { periodMonths: "asc" },
            { indexType: "asc" },
          ],
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  const savedRates: Record<
    string,
    { ipc?: string; icl?: string; cp?: string }
  > = {};
  for (const r of indexRates) {
    const key = indexRateKey(r.periodYear, r.periodMonth, r.periodMonths);
    const bucket = (savedRates[key] ??= {});
    if (r.indexType === "IPC") bucket.ipc = r.percent.toString();
    if (r.indexType === "ICL") bucket.icl = r.percent.toString();
    if (r.indexType === "CP") bucket.cp = r.percent.toString();
  }

  const tableRows = [
    ...new Set(
      indexRates.map((r) =>
        indexRateKey(r.periodYear, r.periodMonth, r.periodMonths),
      ),
    ),
  ].map((key) => {
    const [y, m, p] = key.split("-").map(Number);
    const rates = savedRates[key] ?? {};
    return { year: y!, month: m!, period: p!, rates };
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Contratos"
        description="Alquileres activos, partes y condiciones de ajuste."
        actions={
          staff ? (
            <Link href="/contratos/nuevo">
              <Button>Nuevo contrato</Button>
            </Link>
          ) : undefined
        }
      />

      {staff ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold">Índices IPC / ICL / CP</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Un registro por año, mes y período (
              {INDEX_PERIOD_OPTIONS.join(", ")} meses). Al guardar se aplica el
              mayor % a los contratos que deban actualizar el mes siguiente.
            </p>
          </div>
          <IndexRatesForm
            defaults={{
              periodYear: currentYear,
              periodMonth: currentMonth,
              periodMonths: 6,
              ...savedRates[
                indexRateKey(currentYear, currentMonth, 6)
              ],
            }}
            savedRates={savedRates}
          />
          <div>
            <IndexRatesLoadedButton
              rows={tableRows.map((row) => ({
                year: row.year,
                month: row.month,
                period: row.period,
                ipc: row.rates.ipc,
                icl: row.rates.icl,
                cp: row.rates.cp,
              }))}
            />
          </div>
        </section>
      ) : null}

      <FilterBar>
        <Input name="q" placeholder="Buscar código o propiedad" defaultValue={q} />
        <Select name="status" defaultValue={status ?? ""}>
          <option value="">Todos los estados</option>
          {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((s) => (
            <option key={s} value={s}>
              {CONTRACT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </FilterBar>
      <DataTable
        headers={[
          "Código",
          "Propiedad",
          "Inquilino",
          "Alquiler",
          "Vigencia",
          "Estado",
          "",
        ]}
        empty={contracts.length === 0}
      >
        {contracts.map((c) => {
          const tenant = c.parties.find((p) => p.role === "TENANT")?.user;
          return (
            <tr key={c.id} className="hover:bg-[var(--muted)]/40">
              <td className="px-4 py-3 font-medium">{c.code}</td>
              <td className="px-4 py-3">{c.property.title}</td>
              <td className="px-4 py-3 text-[var(--muted-foreground)]">
                {tenant?.name ?? "—"}
              </td>
              <td className="px-4 py-3">
                {formatMoney(c.initialRent.toString(), c.currency)}
              </td>
              <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                {formatDateOnly(c.startDate)} → {formatDateOnly(c.endDate)}
              </td>
              <td className="px-4 py-3">
                <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>
                  {CONTRACT_STATUS_LABELS[c.status]}
                </Badge>
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
    </div>
  );
}
