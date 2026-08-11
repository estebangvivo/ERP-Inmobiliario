import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/erp/page-chrome";
import { SaleDealEditForm } from "@/components/erp/sale-deal-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SALE_DEAL_STAGE_LABELS } from "@/lib/labels";
import { formatDateOnly, toDateInputValue } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/session";

type Params = Promise<{ id: string }>;

export default async function VentaDetailPage({ params }: { params: Params }) {
  const session = await requireModule("ventas");
  const { id } = await params;

  const deal = await prisma.saleDeal.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      property: true,
      assignee: { select: { name: true } },
      lead: { select: { id: true, name: true } },
    },
  });
  if (!deal) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={deal.buyerName}
        description={deal.property.title}
        actions={
          <Badge variant="secondary">
            {SALE_DEAL_STAGE_LABELS[deal.stage]}
          </Badge>
        }
      />

      <div className="flex flex-wrap gap-2 text-sm text-[var(--muted-foreground)]">
        {deal.offerAmount != null ? (
          <span>
            Oferta: {formatMoney(deal.offerAmount.toString(), deal.currency)}
          </span>
        ) : null}
        {deal.reservationAmount != null ? (
          <span>
            Seña:{" "}
            {formatMoney(deal.reservationAmount.toString(), deal.currency)}
            {deal.reservationPaid ? " · cobrada" : " · pendiente"}
          </span>
        ) : null}
        {deal.commissionPct != null ? (
          <span>
            Comisión {Number(deal.commissionPct)}%
            {deal.commissionAmount != null
              ? ` · ${formatMoney(deal.commissionAmount.toString(), deal.currency)}`
              : ""}
          </span>
        ) : null}
        {deal.deedDate ? (
          <span>Boleto: {formatDateOnly(deal.deedDate)}</span>
        ) : null}
        {deal.assignee ? <span>Agente: {deal.assignee.name}</span> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/gestion/propiedades/${deal.propertyId}`}>
          <Button variant="outline" size="sm">
            Ver propiedad
          </Button>
        </Link>
        <Link href="/ventas">
          <Button variant="outline" size="sm">
            Volver al pipeline
          </Button>
        </Link>
      </div>

      <SaleDealEditForm
        deal={{
          id: deal.id,
          buyerName: deal.buyerName,
          buyerEmail: deal.buyerEmail,
          buyerPhone: deal.buyerPhone,
          stage: deal.stage,
          offerAmount: deal.offerAmount?.toString() ?? null,
          reservationAmount: deal.reservationAmount?.toString() ?? null,
          reservationPaid: deal.reservationPaid,
          commissionPct: deal.commissionPct?.toString() ?? null,
          deedDate: deal.deedDate ? toDateInputValue(deal.deedDate) : "",
          notes: deal.notes,
        }}
      />
    </div>
  );
}
