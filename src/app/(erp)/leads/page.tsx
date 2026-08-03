import Link from "next/link";
import { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/session";
import { leadScopeWhere } from "@/lib/tenant-scope";
import { publicPropertyPath } from "@/lib/public-org";
import { formatDateOnly } from "@/lib/dates";
import { LEAD_STATUS_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DataTable, FilterBar, PageHeader } from "@/components/erp/page-chrome";
import { LeadStatusButton } from "@/components/erp/lead-status-button";

type SearchParams = Promise<{ status?: string }>;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireModule("consultas");
  const { status } = await searchParams;
  const statusFilter = status as LeadStatus | undefined;

  const scope = leadScopeWhere(session);
  const where: Prisma.LeadWhereInput = {
    AND: [scope, statusFilter ? { status: statusFilter } : {}],
  };

  const [leads, org] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        property: true,
        assignee: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { slug: true },
    }),
  ]);

  const orgSlug = org?.slug ?? "";

  return (
    <div>
      <PageHeader
        title="Consultas"
        description="Consultas del portal público vinculadas al sistema."
      />

      <FilterBar className="lg:grid-cols-3">
        <Select name="status" defaultValue={statusFilter ?? ""}>
          <option value="">Todos</option>
          {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </FilterBar>

      <DataTable
        headers={["Fecha", "Contacto", "Propiedad", "Mensaje", "Estado", ""]}
        empty={leads.length === 0}
      >
        {leads.map((lead) => (
          <tr key={lead.id}>
            <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
              {formatDateOnly(lead.createdAt)}
            </td>
            <td className="px-4 py-3">
              <p className="font-medium">{lead.name}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {lead.email}
                {lead.phone ? ` · ${lead.phone}` : ""}
              </p>
            </td>
            <td className="px-4 py-3">
              {lead.property && orgSlug ? (
                <Link
                  href={publicPropertyPath(orgSlug, lead.property.slug)}
                  className="text-[var(--primary)] underline"
                  target="_blank"
                >
                  {lead.property.title}
                </Link>
              ) : (
                "—"
              )}
            </td>
            <td className="max-w-xs truncate px-4 py-3 text-sm text-[var(--muted-foreground)]">
              {lead.message}
            </td>
            <td className="px-4 py-3">
              <Badge variant={lead.status === "NEW" ? "warning" : "secondary"}>
                {LEAD_STATUS_LABELS[lead.status]}
              </Badge>
            </td>
            <td className="px-4 py-3 text-right">
              <LeadStatusButton id={lead.id} status={lead.status} />
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
