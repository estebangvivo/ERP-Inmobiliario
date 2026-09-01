import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { settlementScopeWhere } from "@/lib/tenant-scope";
import { formatMoney } from "@/lib/money";
import { SETTLEMENT_STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, ListPagination, PageHeader } from "@/components/erp/page-chrome";
import {
  clampListPage,
  parseListPage,
  parseListPageSize,
  prismaSkipTake,
} from "@/lib/list-pagination";
import { GenerateSettlementForm } from "@/components/erp/settlement-forms";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";

export default async function RendicionesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const session = await requireModule("rendiciones");
  const staff = isStaffRole(session.organizationRole);
  const scope = settlementScopeWhere(session);
  const params = await searchParams;
  const pageSize = parseListPageSize(params.pageSize);
  const listParams = {
    pageSize: pageSize !== 10 ? String(pageSize) : undefined,
  };

  const [owners, total] = await Promise.all([
    staff
      ? prisma.organizationMember.findMany({
          where: {
            organizationId: session.organizationId,
            role: "OWNER",
            user: {
              isActive: true,
              ...excludePlatformSuperadminFromUser(),
            },
          },
          include: { user: { select: { id: true, name: true, documentNumber: true, email: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    prisma.ownerSettlement.count({ where: scope }),
  ]);

  const page = clampListPage(parseListPage(params.page), total, pageSize);
  const settlements = await prisma.ownerSettlement.findMany({
    where: scope,
    include: { owner: true, _count: { select: { lines: true } } },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    ...prismaSkipTake(page, pageSize),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rendiciones"
        description="Liquidaciones automáticas a propietarios (alquiler − honorarios − reparaciones − extraordinarias)."
        actions={
          staff ? (
            <a href="/api/export/rendiciones">
              <Button variant="outline">Exportar CSV</Button>
            </a>
          ) : undefined
        }
      />

      {staff ? (
        <GenerateSettlementForm owners={owners.map((o) => o.user)} />
      ) : null}

      <DataTable
        headers={["Código", "Propietario", "Período", "Bruto", "Neto", "Estado", ""]}
        empty={total === 0}
      >
        {settlements.map((s) => (
          <tr key={s.id} data-testid={`settlement-row-${s.code}`}>
            <td className="px-4 py-3 font-medium">{s.code}</td>
            <td className="px-4 py-3">{s.owner.name}</td>
            <td className="px-4 py-3">
              {s.periodMonth}/{s.periodYear}
            </td>
            <td className="px-4 py-3">
              {formatMoney(s.grossRent.toString(), s.currency)}
            </td>
            <td className="px-4 py-3 font-semibold">
              {formatMoney(s.netPayout.toString(), s.currency)}
            </td>
            <td className="px-4 py-3">
              <Badge
                variant={
                  s.status === "PAID"
                    ? "success"
                    : s.status === "ISSUED"
                      ? "warning"
                      : "secondary"
                }
              >
                {SETTLEMENT_STATUS_LABELS[s.status]}
              </Badge>
            </td>
            <td className="px-4 py-3 text-right">
              <Link href={`/rendiciones/${s.id}`}>
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
