import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { settlementScopeWhere } from "@/lib/tenant-scope";
import { formatMoney } from "@/lib/money";
import { SETTLEMENT_STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, PageHeader } from "@/components/erp/page-chrome";
import { GenerateSettlementForm } from "@/components/erp/settlement-forms";

export default async function RendicionesPage() {
  const session = await requireModule("rendiciones");
  const staff = isStaffRole(session.organizationRole);
  const scope = settlementScopeWhere(session);

  const [owners, settlements] = await Promise.all([
    staff
      ? prisma.organizationMember.findMany({
          where: {
            organizationId: session.organizationId,
            role: "OWNER",
            user: { isActive: true },
          },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    prisma.ownerSettlement.findMany({
      where: scope,
      include: { owner: true, _count: { select: { lines: true } } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rendiciones"
        description="Liquidaciones automáticas a propietarios (alquiler − comisión − reparaciones − extraordinarias)."
      />

      {staff ? (
        <GenerateSettlementForm owners={owners.map((o) => o.user)} />
      ) : null}

      <DataTable
        headers={["Código", "Propietario", "Período", "Bruto", "Neto", "Estado", ""]}
        empty={settlements.length === 0}
      >
        {settlements.map((s) => (
          <tr key={s.id}>
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
    </div>
  );
}
