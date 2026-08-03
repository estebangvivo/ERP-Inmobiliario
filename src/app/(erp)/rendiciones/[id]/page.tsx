import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-chrome";
import { SettlementActions } from "@/components/erp/settlement-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";

type Params = Promise<{ id: string }>;

export default async function RendicionDetailPage({ params }: { params: Params }) {
  await requireStaff();
  const { id } = await params;

  const settlement = await prisma.ownerSettlement.findUnique({
    where: { id },
    include: {
      owner: true,
      lines: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!settlement) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={settlement.code}
        description={`${settlement.owner.name} · ${settlement.periodMonth}/${settlement.periodYear}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{settlement.status}</Badge>
            <a
              href={`/api/rendiciones/${settlement.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Button size="sm" variant="outline">
                Descargar PDF
              </Button>
            </a>
          </div>
        }
      />

      <SettlementActions id={settlement.id} status={settlement.status} />

      <div className="grid gap-4 md:grid-cols-4">
        <Stat
          label="Alquiler bruto"
          value={formatMoney(settlement.grossRent.toString(), settlement.currency)}
        />
        <Stat
          label="Comisión"
          value={formatMoney(
            settlement.commissionAmount.toString(),
            settlement.currency,
          )}
        />
        <Stat
          label="Deducciones"
          value={formatMoney(
            settlement.deductionsAmount.toString(),
            settlement.currency,
          )}
        />
        <Stat
          label="Neto a pagar"
          value={formatMoney(settlement.netPayout.toString(), settlement.currency)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle de liquidación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {settlement.lines.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Sin movimientos en el período.
            </p>
          ) : (
            settlement.lines.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm last:border-0"
              >
                <p>{line.concept}</p>
                <p
                  className={
                    Number(line.amount) < 0
                      ? "text-[var(--destructive)]"
                      : "font-medium"
                  }
                >
                  {formatMoney(line.amount.toString(), settlement.currency)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
