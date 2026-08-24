import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import {
  propertyScopeWhere,
  workOrderScopeWhere,
} from "@/lib/tenant-scope";
import { COST_BEARER_LABELS, WORK_ORDER_STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, ListPagination, PageHeader } from "@/components/erp/page-chrome";
import {
  clampListPage,
  parseListPage,
  parseListPageSize,
  prismaSkipTake,
} from "@/lib/list-pagination";
import { WorkOrderForm } from "@/components/erp/work-order-forms";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";

export default async function MantenimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const session = await requireModule("mantenimiento");
  const staff = isStaffRole(session.organizationRole);
  const params = await searchParams;
  const pageSize = parseListPageSize(params.pageSize);
  const listParams = {
    pageSize: pageSize !== 10 ? String(pageSize) : undefined,
  };

  const propScope = propertyScopeWhere(session);
  const woScope = workOrderScopeWhere(session);

  const [properties, suppliers, total] = await Promise.all([
    prisma.property.findMany({
      where: propScope,
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    staff
      ? prisma.organizationMember.findMany({
          where: {
            organizationId: session.organizationId,
            role: "SUPPLIER",
            user: {
              isActive: true,
              ...excludePlatformSuperadminFromUser(),
            },
          },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    prisma.workOrder.count({ where: woScope }),
  ]);

  const page = clampListPage(parseListPage(params.page), total, pageSize);
  const workOrders = await prisma.workOrder.findMany({
    where: woScope,
    include: {
      property: true,
      assignee: true,
      _count: { select: { invoices: true } },
    },
    orderBy: { requestedAt: "desc" },
    ...prismaSkipTake(page, pageSize),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Obras y Mantenimiento"
        description={
          staff
            ? "Órdenes de trabajo y facturas de proveedores."
            : "Consultá tus reclamos o cargá uno nuevo."
        }
      />

      {properties.length > 0 ? (
        <WorkOrderForm
          properties={properties}
          suppliers={suppliers.map((s) => s.user)}
          portalMode={!staff}
        />
      ) : null}

      <DataTable
        headers={["Código", "Título", "Propiedad", "Proveedor", "Cargo", "Estado", "Facturas", ""]}
        empty={total === 0}
      >
        {workOrders.map((wo) => (
          <tr key={wo.id}>
            <td className="px-4 py-3 font-medium">{wo.code}</td>
            <td className="px-4 py-3">{wo.title}</td>
            <td className="px-4 py-3 text-[var(--muted-foreground)]">{wo.property.title}</td>
            <td className="px-4 py-3">{wo.assignee?.name ?? "—"}</td>
            <td className="px-4 py-3 text-xs">{COST_BEARER_LABELS[wo.costBearer]}</td>
            <td className="px-4 py-3">
              <Badge variant={wo.status === "COMPLETED" ? "success" : "secondary"}>
                {WORK_ORDER_STATUS_LABELS[wo.status]}
              </Badge>
            </td>
            <td className="px-4 py-3">{wo._count.invoices}</td>
            <td className="px-4 py-3 text-right">
              <Link href={`/mantenimiento/${wo.id}`}>
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
