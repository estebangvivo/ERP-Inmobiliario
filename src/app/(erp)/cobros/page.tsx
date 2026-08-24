import Link from "next/link";
import { BillStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule, isStaffRole } from "@/lib/session";
import { billScopeWhere } from "@/lib/tenant-scope";
import { formatMoney } from "@/lib/money";
import { BILL_STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable, FilterBar, ListPagination, PageHeader } from "@/components/erp/page-chrome";
import {
  clampListPage,
  parseListPage,
  parseListPageSize,
  prismaSkipTake,
} from "@/lib/list-pagination";
import { GenerateBillsForm } from "@/components/erp/billing-forms";
import { syncOverdueBills } from "@/server/services/billing";

function statusVariant(status: BillStatus) {
  if (status === "PAID") return "success" as const;
  if (status === "OVERDUE") return "danger" as const;
  if (status === "PARTIAL") return "warning" as const;
  return "secondary" as const;
}

type SearchParams = Promise<{ q?: string; status?: string; page?: string; pageSize?: string }>;

export default async function CobrosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("cobros");
  const staff = isStaffRole(session.organizationRole);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status as BillStatus | undefined;
  const pageSize = parseListPageSize(params.pageSize);
  const listParams = {
    q: q || undefined,
    status: status || undefined,
    pageSize: pageSize !== 10 ? String(pageSize) : undefined,
  };

  await syncOverdueBills(session.organizationId);

  const scope = billScopeWhere(session);
  const where: Prisma.TenantBillWhereInput = {
    AND: [
      scope,
      status ? { status } : {},
      q
        ? {
            OR: [
              { contract: { code: { contains: q, mode: "insensitive" } } },
              {
                contract: {
                  property: { title: { contains: q, mode: "insensitive" } },
                },
              },
            ],
          }
        : {},
    ],
  };

  const total = await prisma.tenantBill.count({ where });
  const page = clampListPage(parseListPage(params.page), total, pageSize);
  const bills = await prisma.tenantBill.findMany({
    where,
    include: {
      contract: { include: { property: true } },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { dueDate: "asc" }],
    ...prismaSkipTake(page, pageSize),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cobros"
        description="Cuotas de alquiler, expensas y registro de pagos."
        actions={
          staff ? (
            <div className="flex flex-wrap gap-2">
              <a href="/api/export/morosos">
                <Button variant="outline" size="sm">
                  Exportar morosos
                </Button>
              </a>
              <Link href="/cobros/cuenta-corriente">
                <Button variant="outline" size="sm">
                  Cuenta corriente
                </Button>
              </Link>
            </div>
          ) : undefined
        }
      />

      {staff ? <GenerateBillsForm /> : null}

      <FilterBar>
        <Input name="q" placeholder="Contrato o propiedad" defaultValue={q} />
        <Select name="status" defaultValue={status ?? ""}>
          <option value="">Todos los estados</option>
          {(Object.keys(BILL_STATUS_LABELS) as BillStatus[]).map((s) => (
            <option key={s} value={s}>{BILL_STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </FilterBar>

      <DataTable
        headers={["Período", "Contrato", "Propiedad", "Total", "Pagado", "Estado", ""]}
        empty={total === 0}
      >
        {bills.map((bill) => (
          <tr key={bill.id} className="hover:bg-[var(--muted)]/40">
            <td className="px-4 py-3 font-medium">
              {bill.periodMonth}/{bill.periodYear}
            </td>
            <td className="px-4 py-3">{bill.contract.code}</td>
            <td className="px-4 py-3 text-[var(--muted-foreground)]">
              {bill.contract.property.title}
            </td>
            <td className="px-4 py-3">
              {formatMoney(bill.totalAmount.toString(), bill.currency)}
            </td>
            <td className="px-4 py-3">
              {formatMoney(bill.paidAmount.toString(), bill.currency)}
            </td>
            <td className="px-4 py-3">
              <Badge variant={statusVariant(bill.status)}>
                {BILL_STATUS_LABELS[bill.status]}
              </Badge>
            </td>
            <td className="px-4 py-3 text-right">
              <Link href={`/cobros/${bill.id}`}>
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
