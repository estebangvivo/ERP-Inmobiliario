import Link from "next/link";
import type { SaleDealStage } from "@prisma/client";
import { PageHeader } from "@/components/erp/page-chrome";
import { CreateSaleDealForm, SaleStageButtons } from "@/components/erp/sale-deal-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SALE_DEAL_STAGE_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/session";

const STAGES = Object.keys(SALE_DEAL_STAGE_LABELS) as SaleDealStage[];

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const session = await requireModule("ventas");
  const { propertyId } = await searchParams;

  const [deals, properties] = await Promise.all([
    prisma.saleDeal.findMany({
      where: { organizationId: session.organizationId },
      include: {
        property: { select: { id: true, title: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.property.findMany({
      where: {
        organizationId: session.organizationId,
        operationType: { in: ["SALE", "BOTH"] },
        status: { notIn: ["SOLD", "INACTIVE"] },
      },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const byStage = STAGES.map((stage) => ({
    stage,
    items: deals.filter((d) => d.stage === stage),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventas"
        description="Pipeline de oportunidades: interés → seña → cierre."
      />

      <CreateSaleDealForm
        properties={properties}
        defaultPropertyId={propertyId}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        {byStage.map(({ stage, items }) => (
          <Card key={stage} className="min-h-[200px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {SALE_DEAL_STAGE_LABELS[stage]}{" "}
                <span className="text-[var(--muted-foreground)]">
                  ({items.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)]">Vacío</p>
              ) : (
                items.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-[var(--border)] p-3 text-sm"
                  >
                    <Link
                      href={`/ventas/${d.id}`}
                      className="font-medium hover:underline"
                    >
                      {d.buyerName}
                    </Link>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {d.property.title}
                    </p>
                    {d.reservationAmount != null ? (
                      <p className="mt-1 text-xs">
                        Seña{" "}
                        {formatMoney(
                          d.reservationAmount.toString(),
                          d.currency,
                        )}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <SaleStageButtons dealId={d.id} current={d.stage} />
                    </div>
                    <div className="mt-2">
                      <Link href={`/ventas/${d.id}`}>
                        <Button size="sm" variant="outline">
                          Detalle
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
