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

  const contracts = await prisma.contract.findMany({
    where,
    include: {
      property: true,
      parties: { include: { user: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
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
      <FilterBar>
        <Input name="q" placeholder="Buscar código o propiedad" defaultValue={q} />
        <Select name="status" defaultValue={status ?? ""}>
          <option value="">Todos los estados</option>
          {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((s) => (
            <option key={s} value={s}>{CONTRACT_STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </FilterBar>
      <DataTable
        headers={["Código", "Propiedad", "Inquilino", "Alquiler", "Vigencia", "Estado", ""]}
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
                  <Button size="sm" variant="outline">Ver</Button>
                </Link>
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
