import Link from "next/link";
import { CreditCard } from "lucide-react";
import {
  BILLING_PLANS,
  normalizeBillingPlanId,
  planMaxUsers,
} from "@/features/billing/lib/plans";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activo",
  PAST_DUE: "Vencido",
  PENDING_PAYMENT: "Pago pendiente",
  EXEMPT: "Exento",
};

type OrganizationPlanCardProps = {
  billingPlan: string | null;
  billingStatus: string;
  paidUntil: Date | string | null;
};

function formatPaidUntil(paidUntil: Date | string | null): string {
  if (!paidUntil) return "—";
  const date =
    paidUntil instanceof Date ? paidUntil : new Date(paidUntil);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR");
}

function formatSeatsLabel(planId: ReturnType<typeof normalizeBillingPlanId>): string | null {
  if (!planId) return null;
  const maxUsers = planMaxUsers(planId);
  if (maxUsers === null) return "Ilimitado";
  return `Hasta ${maxUsers} usuarios`;
}

export function OrganizationPlanCard({
  billingPlan,
  billingStatus,
  paidUntil,
}: OrganizationPlanCardProps) {
  const planId = normalizeBillingPlanId(billingPlan);
  const planLabel = planId ? BILLING_PLANS[planId].label : "Sin plan";
  const seatsLabel = formatSeatsLabel(planId);
  const statusLabel = STATUS_LABEL[billingStatus] ?? billingStatus;
  const isExempt = billingStatus === "EXEMPT";

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Suscripción</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Plan actual de la inmobiliaria y opción para cambiarlo o renovarlo.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
        <p>
          <span className="text-[var(--muted-foreground)]">Plan:</span> {planLabel}
        </p>
        {seatsLabel ? (
          <p>
            <span className="text-[var(--muted-foreground)]">Cupo:</span> {seatsLabel}
          </p>
        ) : null}
        <p>
          <span className="text-[var(--muted-foreground)]">Estado:</span> {statusLabel}
        </p>
        <p>
          <span className="text-[var(--muted-foreground)]">Vigente hasta:</span>{" "}
          {isExempt ? "Sin vencimiento" : formatPaidUntil(paidUntil)}
        </p>

        {isExempt ? (
          <p className="text-[var(--muted-foreground)]">
            Esta inmobiliaria está exenta de facturación.
          </p>
        ) : null}

        <div className="pt-2">
          <Link
            href="/onboarding/planes"
            className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
          >
            <CreditCard className="size-4 shrink-0" aria-hidden />
            Modificar plan
          </Link>
        </div>
      </div>
    </section>
  );
}
