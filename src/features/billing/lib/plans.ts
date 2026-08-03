import type { BillingPlan } from "@prisma/client";

export type BillingCycle = "MONTHLY" | "ANNUAL";
export type BillingTierId = "SOLO" | "TEAM" | "UNLIMITED";

type PlanDef = {
  id: string;
  label: string;
  priceUsd: number;
  priceArs?: number;
  days: number;
  cycle: BillingCycle;
  tier: BillingTierId | "TRIAL";
  maxUsers: number | null;
  description: string;
  isTrial: boolean;
};

export const BILLING_PLANS = {
  TRIAL: {
    id: "TRIAL",
    label: "Prueba 30 días",
    priceUsd: 0,
    priceArs: 0,
    days: 30,
    cycle: "MONTHLY" as const,
    tier: "TRIAL" as const,
    maxUsers: 1,
    description: "30 días con 1 usuario. Para sumar personas, contratá un plan.",
    isTrial: true,
  },
  SOLO_MONTHLY: {
    id: "SOLO_MONTHLY",
    label: "Unipersonal · mensual",
    priceUsd: 59,
    days: 30,
    cycle: "MONTHLY" as const,
    tier: "SOLO" as const,
    maxUsers: 1,
    description: "1 usuario por inmobiliaria.",
    isTrial: false,
  },
  SOLO_ANNUAL: {
    id: "SOLO_ANNUAL",
    label: "Unipersonal · anual",
    priceUsd: 599,
    days: 365,
    cycle: "ANNUAL" as const,
    tier: "SOLO" as const,
    maxUsers: 1,
    description: "1 usuario. Pago anual.",
    isTrial: false,
  },
  TEAM_MONTHLY: {
    id: "TEAM_MONTHLY",
    label: "Equipo · mensual",
    priceUsd: 99,
    days: 30,
    cycle: "MONTHLY" as const,
    tier: "TEAM" as const,
    maxUsers: 5,
    description: "Hasta 5 usuarios por inmobiliaria.",
    isTrial: false,
  },
  TEAM_ANNUAL: {
    id: "TEAM_ANNUAL",
    label: "Equipo · anual",
    priceUsd: 999,
    days: 365,
    cycle: "ANNUAL" as const,
    tier: "TEAM" as const,
    maxUsers: 5,
    description: "Hasta 5 usuarios. Pago anual.",
    isTrial: false,
  },
  UNLIMITED_MONTHLY: {
    id: "UNLIMITED_MONTHLY",
    label: "Ilimitado · mensual",
    priceUsd: 119,
    days: 30,
    cycle: "MONTHLY" as const,
    tier: "UNLIMITED" as const,
    maxUsers: null,
    description: "Usuarios ilimitados.",
    isTrial: false,
  },
  UNLIMITED_ANNUAL: {
    id: "UNLIMITED_ANNUAL",
    label: "Ilimitado · anual",
    priceUsd: 1199,
    days: 365,
    cycle: "ANNUAL" as const,
    tier: "UNLIMITED" as const,
    maxUsers: null,
    description: "Usuarios ilimitados. Pago anual.",
    isTrial: false,
  },
} as const satisfies Record<string, PlanDef>;

export type BillingPlanId = keyof typeof BILLING_PLANS;

export const BILLING_TIERS = {
  SOLO: {
    id: "SOLO",
    label: "Unipersonal",
    monthly: "SOLO_MONTHLY" as BillingPlanId,
    annual: "SOLO_ANNUAL" as BillingPlanId,
  },
  TEAM: {
    id: "TEAM",
    label: "Equipo",
    monthly: "TEAM_MONTHLY" as BillingPlanId,
    annual: "TEAM_ANNUAL" as BillingPlanId,
  },
  UNLIMITED: {
    id: "UNLIMITED",
    label: "Ilimitado",
    monthly: "UNLIMITED_MONTHLY" as BillingPlanId,
    annual: "UNLIMITED_ANNUAL" as BillingPlanId,
  },
} as const;

export function normalizeBillingPlanId(
  plan: string | BillingPlan | null | undefined,
): BillingPlanId | null {
  if (!plan) return null;
  if (plan in BILLING_PLANS) return plan as BillingPlanId;
  return null;
}

export function addBillingPeriod(from: Date, plan: BillingPlanId): Date {
  const days = BILLING_PLANS[plan].days;
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return end;
}

export function planIsMonthlyCycle(plan: BillingPlanId): boolean {
  return BILLING_PLANS[plan].cycle === "MONTHLY";
}

export function planMaxUsers(plan: BillingPlanId | null | undefined): number | null {
  if (!plan) return null;
  return BILLING_PLANS[plan]?.maxUsers ?? null;
}

export function organizationHasAppAccess(org: {
  billingStatus: string;
  paidUntil: Date | null;
}): boolean {
  if (org.billingStatus === "EXEMPT") return true;
  if (org.billingStatus === "ACTIVE" && org.paidUntil) {
    return org.paidUntil.getTime() > Date.now();
  }
  return false;
}
