"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BILLING_PLANS, BILLING_TIERS } from "@/features/billing/lib/plans";
import {
  startTrialOrPaidCheckout,
} from "@/features/billing/actions/billing-actions";
import type { BillingPlanId } from "@/features/billing/lib/plans";

export function OnboardingPlansForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanId>("TRIAL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await startTrialOrPaidCheckout({
      plan: selectedPlan,
      companyName,
      companySlug: companySlug || undefined,
      method: selectedPlan === "TRIAL" ? "TRIAL" : "TRANSFER",
    });

    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push(
      selectedPlan === "TRIAL" ? "/dashboard" : "/onboarding/pago",
    );
    router.refresh();
  }

  return (
    <Card className="w-full max-w-2xl border-[var(--border)] shadow-lg">
      <CardHeader>
        <CardTitle>Elegí tu plan</CardTitle>
        <CardDescription>
          Creá tu inmobiliaria y empezá a gestionar propiedades.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="companyName">Nombre de la inmobiliaria</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ej. Inmobiliaria Sur"
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="companySlug">Identificador (slug)</Label>
              <Input
                id="companySlug"
                value={companySlug}
                onChange={(e) => setCompanySlug(e.target.value)}
                placeholder="inmobiliaria-sur (opcional)"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Plan</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <PlanOption
                id="TRIAL"
                label={BILLING_PLANS.TRIAL.label}
                description={BILLING_PLANS.TRIAL.description}
                price="Gratis 30 días"
                selected={selectedPlan === "TRIAL"}
                onSelect={() => setSelectedPlan("TRIAL")}
              />
              {Object.values(BILLING_TIERS).map((tier) => {
                const planId = tier.monthly;
                const plan = BILLING_PLANS[planId];
                return (
                  <PlanOption
                    key={planId}
                    id={planId}
                    label={plan.label}
                    description={plan.description}
                    price={`USD ${plan.priceUsd}/mes`}
                    selected={selectedPlan === planId}
                    onSelect={() => setSelectedPlan(planId)}
                  />
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Procesando…"
              : selectedPlan === "TRIAL"
                ? "Empezar prueba gratis"
                : "Continuar al pago"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PlanOption({
  id,
  label,
  description,
  price,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  description: string;
  price: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border p-4 text-left transition ${
        selected
          ? "border-[var(--primary)] bg-[var(--primary)]/5 ring-1 ring-[var(--primary)]"
          : "border-[var(--border)] hover:border-[var(--ring)]"
      }`}
    >
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{description}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--primary)]">{price}</p>
    </button>
  );
}
