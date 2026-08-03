import { prisma } from "@/lib/prisma";
import {
  BILLING_PLANS,
  type BillingPlanId,
} from "@/features/billing/lib/plans";

export type PlanPriceOverride = {
  priceUsd?: number;
  priceArs?: number | null;
  discountPercent?: number | null;
  discountUntil?: string | null;
  discountPromoMonths?: number | null;
};

export type PlanPricesMap = Partial<Record<BillingPlanId, PlanPriceOverride>>;

export type EffectivePlanPrice = {
  listPriceUsd: number;
  listPriceArs: number | null;
  priceUsd: number;
  priceArs: number | null;
  discountPercent: number | null;
  discountUntil: string | null;
  discountPromoMonths: number | null;
};

export function todayDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizeDiscountUntil(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizeDiscountPercent(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, Math.round(n * 100) / 100);
}

export function normalizeDiscountPromoMonths(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(36, Math.round(n));
}

export function isPlanDiscountActive(
  percent: number | null | undefined,
  until: string | null | undefined,
  now = new Date(),
): boolean {
  const p = normalizeDiscountPercent(percent);
  const u = normalizeDiscountUntil(until);
  if (p == null || u == null) return false;
  return todayDateKey(now) <= u;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function applyPercentDiscount(amount: number, percent: number): number {
  return roundMoney(amount * (1 - percent / 100));
}

function defaultPriceArs(
  def: (typeof BILLING_PLANS)[BillingPlanId],
): number | null {
  return "priceArs" in def && typeof def.priceArs === "number"
    ? def.priceArs
    : null;
}

async function readPlanPricesMap(): Promise<PlanPricesMap> {
  const row = await prisma.platformBillingSettings.findUnique({
    where: { id: "default" },
    select: { planPrices: true },
  });
  if (!row?.planPrices || typeof row.planPrices !== "object") return {};
  return row.planPrices as PlanPricesMap;
}

export async function getAdminPlanPricesEditor() {
  const overrides = await readPlanPricesMap();
  return (Object.keys(BILLING_PLANS) as BillingPlanId[]).map((id) => {
    const def = BILLING_PLANS[id];
    const o = overrides[id] ?? {};
    const baseArs = defaultPriceArs(def);
    return {
      id,
      label: def.label,
      isTrial: def.isTrial,
      priceUsd: o.priceUsd ?? def.priceUsd,
      priceArs: o.priceArs !== undefined ? o.priceArs : baseArs,
      discountPercent: o.discountPercent ?? null,
      discountUntil: o.discountUntil ?? null,
      discountPromoMonths: o.discountPromoMonths ?? null,
      defaultPriceUsd: def.priceUsd,
      defaultPriceArs: baseArs,
    };
  });
}

export async function upsertPlanPrices(input: {
  prices: PlanPricesMap;
}): Promise<void> {
  await prisma.platformBillingSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      planPrices: input.prices,
      mpSurchargePercent: 4,
    },
    update: { planPrices: input.prices },
  });
}

export function buildEffectiveFromOverride(
  id: BillingPlanId,
  o: PlanPriceOverride | undefined,
): EffectivePlanPrice {
  const def = BILLING_PLANS[id];
  const listUsd = o?.priceUsd ?? def.priceUsd;
  const listArs =
    o?.priceArs !== undefined ? o.priceArs : defaultPriceArs(def);
  const percent = normalizeDiscountPercent(o?.discountPercent);
  const until = normalizeDiscountUntil(o?.discountUntil);
  const months = normalizeDiscountPromoMonths(o?.discountPromoMonths);
  const active = isPlanDiscountActive(percent, until);
  const activePercent = active ? percent : null;
  return {
    listPriceUsd: listUsd,
    listPriceArs: listArs ?? null,
    priceUsd:
      activePercent != null
        ? applyPercentDiscount(listUsd, activePercent)
        : listUsd,
    priceArs:
      listArs == null
        ? null
        : activePercent != null
          ? applyPercentDiscount(listArs, activePercent)
          : listArs,
    discountPercent: activePercent,
    discountUntil: active ? until : null,
    discountPromoMonths: active && months != null ? months : null,
  };
}
