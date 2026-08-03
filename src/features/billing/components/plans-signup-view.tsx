"use client";

import { useState, useTransition } from "react";
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
import { BILLING_PLANS, BILLING_TIERS, type BillingPlanId } from "@/features/billing/lib/plans";
import { startTrialOrPaidCheckout } from "@/features/billing/actions/billing-actions";

export function PlansSignupView() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cycle, setCycle] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");

  function choose(plan: BillingPlanId, method: "TRIAL" | "TRANSFER") {
    startTransition(async () => {
      setError(null);
      const result = await startTrialOrPaidCheckout({
        plan,
        companyName,
        companySlug,
        method,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (method === "TRIAL" || plan === "TRIAL") {
        router.push("/dashboard");
      } else {
        router.push(`/onboarding/pago?paymentId=${result.paymentId}`);
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Elegí un plan
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Activá tu inmobiliaria en SimpleInmo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Nombre de la inmobiliaria</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Slug (opcional)</Label>
            <Input
              value={companySlug}
              onChange={(e) => setCompanySlug(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={cycle === "MONTHLY" ? "default" : "outline"}
          onClick={() => setCycle("MONTHLY")}
        >
          Mensual
        </Button>
        <Button
          size="sm"
          variant={cycle === "ANNUAL" ? "default" : "outline"}
          onClick={() => setCycle("ANNUAL")}
        >
          Anual
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.values(BILLING_TIERS).map((tier) => {
          const planId =
            cycle === "MONTHLY" ? tier.monthly : tier.annual;
          const plan = BILLING_PLANS[planId];
          return (
            <Card key={tier.id}>
              <CardHeader>
                <CardTitle>{tier.label}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-semibold">
                  USD {plan.priceUsd}
                  <span className="text-sm font-normal text-[var(--muted-foreground)]">
                    /{cycle === "MONTHLY" ? "mes" : "año"}
                  </span>
                </p>
                <Button
                  className="w-full"
                  disabled={pending || !companyName.trim()}
                  onClick={() => choose(planId, "TRANSFER")}
                >
                  Continuar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prueba 30 días</CardTitle>
          <CardDescription>{BILLING_PLANS.TRIAL.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={pending || !companyName.trim()}
            onClick={() => choose("TRIAL", "TRIAL")}
          >
            Activar prueba
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}
    </div>
  );
}
