import type {
  Currency,
  OperationType,
  PropertyType,
} from "@prisma/client";
import type { WhatsAppIntent } from "@/features/whatsapp/lib/types";
import {
  publicPropertiesPath,
  publicPropertyPath,
} from "@/lib/public-org";
import { formatPropertyPrices, resolvePropertyPrices } from "@/lib/property-prices";
import { prisma } from "@/lib/prisma";
import { PROPERTY_TYPE_LABELS } from "@/server/validators/property";

const LIST_LIMIT = 5;

export type BudgetRange = {
  id: string;
  title: string;
  /** Texto corto para menú (≤24 chars en listas Meta). */
  description: string;
  min: number;
  max: number | null;
  currency: Currency;
};

/** Rangos de alquiler en ARS (cochera ~40k … galpón ~5M). */
export const RENT_BUDGET_RANGES: BudgetRange[] = [
  {
    id: "budget_rent_0_500",
    title: "Hasta $500.000",
    description: "ARS · cocheras y similares",
    min: 0,
    max: 500_000,
    currency: "ARS",
  },
  {
    id: "budget_rent_500_1m",
    title: "$500.000 a $1M",
    description: "ARS · deptos / locales",
    min: 500_000,
    max: 1_000_000,
    currency: "ARS",
  },
  {
    id: "budget_rent_1m_2m",
    title: "$1M a $2M",
    description: "ARS · alquileres altos",
    min: 1_000_000,
    max: 2_000_000,
    currency: "ARS",
  },
  {
    id: "budget_rent_2m_plus",
    title: "Más de $2.000.000",
    description: "ARS · galpones y grandes",
    min: 2_000_000,
    max: null,
    currency: "ARS",
  },
];

/** Rangos de venta en USD (terrenos ~10k … casas >60k). */
export const SALE_BUDGET_RANGES: BudgetRange[] = [
  {
    id: "budget_sale_10_40",
    title: "USD 10.000-40.000",
    description: "Terrenos / entrada",
    min: 10_000,
    max: 40_000,
    currency: "USD",
  },
  {
    id: "budget_sale_40_100",
    title: "USD 40.000-100.000",
    description: "Deptos y casas",
    min: 40_000,
    max: 100_000,
    currency: "USD",
  },
  {
    id: "budget_sale_100_plus",
    title: "Más de USD 100.000",
    description: "Propiedades premium",
    min: 100_000,
    max: null,
    currency: "USD",
  },
];

export function budgetRangesForIntent(
  intent: "BUY" | "RENT",
): BudgetRange[] {
  return intent === "RENT" ? RENT_BUDGET_RANGES : SALE_BUDGET_RANGES;
}

export type CatalogSearchInput = {
  organizationId: string;
  intent: Extract<WhatsAppIntent, "BUY" | "RENT">;
  zone?: string | null;
  budgetText?: string | null;
  budgetRangeId?: string | null;
  propertyTypeText?: string | null;
  limit?: number;
};

export type CatalogPropertyItem = {
  id: string;
  title: string;
  city: string;
  address: string;
  propertyType: PropertyType;
  rooms: number | null;
  priceLabel: string;
  publicUrl: string | null;
  relevantAmount: number | null;
  relevantCurrency: Currency;
};

export type CatalogSearchResult = {
  total: number;
  items: CatalogPropertyItem[];
  catalogUrl: string | null;
  orgSlug: string | null;
  filtersApplied: {
    zone: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    budgetCurrency: Currency | null;
    budgetLabel: string | null;
    propertyTypes: PropertyType[];
    minRooms: number | null;
  };
};

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
}

function operationFilter(
  intent: "BUY" | "RENT",
): OperationType[] {
  return intent === "RENT" ? ["RENT", "BOTH"] : ["SALE", "BOTH"];
}

function amountInRange(
  amount: number,
  range: Pick<BudgetRange, "min" | "max">,
): boolean {
  if (amount < range.min) return false;
  if (range.max == null) return true;
  return amount <= range.max;
}

export function budgetRangeById(
  intent: "BUY" | "RENT",
  id: string | null | undefined,
): BudgetRange | null {
  if (!id) return null;
  return budgetRangesForIntent(intent).find((r) => r.id === id) ?? null;
}

/** Resuelve rango por id de botón, número de menú o texto libre. */
export function resolveBudgetRange(
  intent: "BUY" | "RENT",
  input: { interactiveId?: string | null; text?: string | null },
): BudgetRange | null {
  const ranges = budgetRangesForIntent(intent);
  if (input.interactiveId) {
    const byId = budgetRangeById(intent, input.interactiveId);
    if (byId) return byId;
  }

  const text = input.text?.trim() ?? "";
  if (!text) return null;

  const asNumber = Number(text);
  if (
    Number.isInteger(asNumber) &&
    asNumber >= 1 &&
    asNumber <= ranges.length
  ) {
    return ranges[asNumber - 1] ?? null;
  }

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  for (const range of ranges) {
    const titleNorm = range.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (
      normalized.includes(titleNorm) ||
      titleNorm.includes(normalized) ||
      normalized.includes(range.id.replace(/_/g, " "))
    ) {
      return range;
    }
  }

  // Atajos por etiquetas de rango
  if (intent === "RENT") {
    if (/hasta\s*\$?\s*500|0\s*[-–a]\s*500/.test(normalized)) {
      return ranges[0] ?? null;
    }
    if (/500.*1\.?000\.?000|500.*1m|500mil/.test(normalized)) {
      return ranges[1] ?? null;
    }
    if (/1\.?000\.?000.*2|1m.*2m|1\s*a\s*2/.test(normalized)) {
      return ranges[2] ?? null;
    }
    if (/mas de\s*\$?\s*2|más de\s*\$?\s*2|>\s*2/.test(normalized)) {
      return ranges[3] ?? null;
    }
  } else {
    if (/10\.?000.*40|usd\s*10/.test(normalized) && !/100/.test(normalized)) {
      return ranges[0] ?? null;
    }
    if (/40\.?000.*100|usd\s*40/.test(normalized)) {
      return ranges[1] ?? null;
    }
    if (/mas de\s*usd\s*100|más de\s*usd\s*100|usd\s*100/.test(normalized)) {
      return ranges[2] ?? null;
    }
  }

  // Monto suelto → ubicar en el rango que lo contiene
  const amount = parseLooseAmount(text);
  if (amount != null) {
    const currencyHint =
      /\b(usd|u\$s|dolar)/.test(normalized) || intent === "BUY"
        ? ("USD" as const)
        : ("ARS" as const);
    const match = ranges.find(
      (r) =>
        r.currency === currencyHint && amountInRange(amount, r),
    );
    if (match) return match;
    return (
      ranges.find((r) => amountInRange(amount, r)) ?? null
    );
  }

  return null;
}

function parseLooseAmount(text: string): number | null {
  const raw = text.trim().toLowerCase();
  const milMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:mil)\b/);
  if (milMatch) {
    const base = Number(milMatch[1].replace(",", "."));
    if (Number.isFinite(base) && base > 0) return Math.round(base * 1000);
  }
  const dotted = raw.match(/\b(\d{1,3}(?:\.\d{3})+)\b/);
  if (dotted) {
    const amount = Number(dotted[1].replace(/\./g, ""));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  const plain = raw.match(/\b(\d{4,})\b/);
  if (plain) {
    const amount = Number(plain[1]);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return null;
}

/** Extrae monto y moneda aproximados de texto libre (compat). */
export function parseBudgetHint(text: string | null | undefined): {
  amount: number | null;
  currency: Currency | null;
  range: BudgetRange | null;
} {
  if (!text?.trim()) return { amount: null, currency: null, range: null };
  // Intent se infiere por moneda/palabras: no ideal, preferí resolveBudgetRange.
  const rentRange = resolveBudgetRange("RENT", { text });
  const saleRange = resolveBudgetRange("BUY", { text });
  const range = rentRange ?? saleRange;
  if (range) {
    return {
      amount: range.max ?? range.min,
      currency: range.currency,
      range,
    };
  }
  const amount = parseLooseAmount(text);
  const raw = text.toLowerCase();
  const currency: Currency | null =
    /\b(usd|u\$s|dolar)/.test(raw)
      ? "USD"
      : /\b(ars|pesos)\b/.test(raw)
        ? "ARS"
        : null;
  return { amount, currency, range: null };
}

export function parsePropertyTypeHint(text: string | null | undefined): {
  types: PropertyType[];
  minRooms: number | null;
} {
  if (!text?.trim()) return { types: [], minRooms: null };
  const raw = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const types: PropertyType[] = [];
  const push = (t: PropertyType) => {
    if (!types.includes(t)) types.push(t);
  };

  if (/\b(monoambiente|mono)\b/.test(raw)) push("STUDIO");
  if (/\b(departamento|depto|deptos|apto|apartamento)\b/.test(raw)) {
    push("APARTMENT");
  }
  if (/\b(casa|casas)\b/.test(raw)) push("HOUSE");
  if (/\b(duplex)\b/.test(raw)) push("DUPLEX");
  if (/\b(cochera|garage|garaje)\b/.test(raw)) push("GARAGE");
  if (/\b(local|comercial)\b/.test(raw)) push("COMMERCIAL");
  if (/\b(terreno|lote)\b/.test(raw)) push("LAND");
  if (/\b(oficina|oficinas)\b/.test(raw)) push("OFFICE");

  const roomsMatch = raw.match(/\b(\d+)\s*(amb|ambientes?|dorm|dormitorios?)\b/);
  const minRooms = roomsMatch ? Number(roomsMatch[1]) : null;

  return {
    types,
    minRooms: Number.isFinite(minRooms) && minRooms != null && minRooms > 0
      ? minRooms
      : null,
  };
}

function relevantPrice(
  intent: "BUY" | "RENT",
  p: {
    operationType: OperationType;
    price: { toString(): string } | number;
    rentPrice?: { toString(): string } | number | null;
    currency: Currency;
    rentCurrency?: Currency | null;
  },
): { amount: number | null; currency: Currency } {
  const resolved = resolvePropertyPrices(p);
  if (intent === "RENT") {
    return {
      amount: resolved.rent,
      currency: resolved.rentCurrency,
    };
  }
  return {
    amount: resolved.sale,
    currency: resolved.saleCurrency,
  };
}

type CatalogPropertyRow = {
  id: string;
  title: string;
  slug: string;
  city: string;
  address: string;
  propertyType: PropertyType;
  operationType: OperationType;
  rooms: number | null;
  price: { toString(): string };
  rentPrice: { toString(): string } | null;
  currency: Currency;
  rentCurrency: Currency | null;
  publishedAt: Date | null;
};

async function loadCatalogCandidates(input: {
  organizationId: string;
  intent: "BUY" | "RENT";
  zone?: string | null;
  propertyTypeText?: string | null;
  take?: number;
}): Promise<CatalogPropertyRow[]> {
  const typeHint = parsePropertyTypeHint(input.propertyTypeText);
  const zone = input.zone?.trim() || null;
  return prisma.property.findMany({
    where: {
      organizationId: input.organizationId,
      status: { in: ["AVAILABLE", "RESERVED"] },
      operationType: { in: operationFilter(input.intent) },
      ...(zone
        ? {
            OR: [
              { city: { contains: zone, mode: "insensitive" } },
              { address: { contains: zone, mode: "insensitive" } },
              { title: { contains: zone, mode: "insensitive" } },
              { province: { contains: zone, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(typeHint.types.length
        ? { propertyType: { in: typeHint.types } }
        : {}),
      ...(typeHint.minRooms != null
        ? { rooms: { gte: typeHint.minRooms } }
        : {}),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      city: true,
      address: true,
      propertyType: true,
      operationType: true,
      rooms: true,
      price: true,
      rentPrice: true,
      currency: true,
      rentCurrency: true,
      publishedAt: true,
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: input.take ?? 80,
  });
}

function resolveSearchBudgetRange(
  intent: "BUY" | "RENT",
  budgetRangeId?: string | null,
  budgetText?: string | null,
): BudgetRange | null {
  return (
    budgetRangeById(intent, budgetRangeId) ??
    resolveBudgetRange(intent, { text: budgetText })
  );
}

function filterByBudgetRange(
  intent: "BUY" | "RENT",
  candidates: CatalogPropertyRow[],
  range: BudgetRange | null,
): CatalogPropertyRow[] {
  if (!range) return candidates;
  const matched = candidates.filter((p) => {
    const { amount, currency } = relevantPrice(intent, p);
    if (amount == null) return false;
    if (currency !== range.currency) return false;
    return amountInRange(amount, range);
  });
  return matched.length > 0 ? matched : candidates;
}

/** Menú de presupuestos con conteo real del inventario (opcionalmente por zona). */
export async function buildBudgetMenuRows(input: {
  organizationId: string;
  intent: "BUY" | "RENT";
  zone?: string | null;
}): Promise<Array<{ id: string; title: string; description: string }>> {
  const ranges = budgetRangesForIntent(input.intent);
  const candidates = await loadCatalogCandidates({
    organizationId: input.organizationId,
    intent: input.intent,
    zone: input.zone,
    take: 120,
  });

  // Siempre las mismas opciones fijas (el número del menú coincide con el orden del rango).
  return ranges.map((range) => {
    const count = candidates.filter((p) => {
      const { amount, currency } = relevantPrice(input.intent, p);
      if (amount == null || currency !== range.currency) return false;
      return amountInRange(amount, range);
    }).length;
    return {
      id: range.id,
      title: range.title,
      description:
        count > 0
          ? `${count} disponible${count === 1 ? "" : "s"} · ${range.description}`
          : `Sin stock ahora · ${range.description}`,
    };
  });
}

export async function searchCatalogProperties(
  input: CatalogSearchInput,
): Promise<CatalogSearchResult> {
  const limit = Math.min(Math.max(input.limit ?? LIST_LIMIT, 1), 8);
  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { slug: true },
  });
  const orgSlug = org?.slug ?? null;
  const origin = appOrigin();
  const catalogUrl = orgSlug
    ? `${origin}${publicPropertiesPath(orgSlug)}?operation=${input.intent === "RENT" ? "RENT" : "SALE"}`
    : null;

  const zone = input.zone?.trim() || null;
  const typeHint = parsePropertyTypeHint(input.propertyTypeText);
  const range = resolveSearchBudgetRange(
    input.intent,
    input.budgetRangeId,
    input.budgetText,
  );

  const candidates = await loadCatalogCandidates({
    organizationId: input.organizationId,
    intent: input.intent,
    zone,
    propertyTypeText: input.propertyTypeText,
    take: 80,
  });

  let filtered = filterByBudgetRange(input.intent, candidates, range);

  filtered = [...filtered].sort((a, b) => {
    const ap = a.publishedAt ? 1 : 0;
    const bp = b.publishedAt ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return 0;
  });

  const items: CatalogPropertyItem[] = filtered.slice(0, limit).map((p) => {
    const { amount, currency } = relevantPrice(input.intent, p);
    const publicUrl =
      orgSlug && p.publishedAt
        ? `${origin}${publicPropertyPath(orgSlug, p.slug)}`
        : null;
    return {
      id: p.id,
      title: p.title,
      city: p.city,
      address: p.address,
      propertyType: p.propertyType,
      rooms: p.rooms,
      priceLabel: formatPropertyPrices(p),
      publicUrl,
      relevantAmount: amount,
      relevantCurrency: currency,
    };
  });

  return {
    total: filtered.length,
    items,
    catalogUrl,
    orgSlug,
    filtersApplied: {
      zone,
      budgetMin: range?.min ?? null,
      budgetMax: range?.max ?? null,
      budgetCurrency: range?.currency ?? null,
      budgetLabel: range?.title ?? null,
      propertyTypes: typeHint.types,
      minRooms: typeHint.minRooms,
    },
  };
}

export function formatCatalogWhatsAppMessage(
  intent: "BUY" | "RENT",
  result: CatalogSearchResult,
  options?: { headline?: string },
): string | null {
  const verb = intent === "RENT" ? "alquiler" : "venta";
  if (result.total === 0 || result.items.length === 0) {
    const lines = [
      options?.headline ??
        `Por ahora no encontré propiedades disponibles de ${verb} con esos criterios.`,
    ];
    if (result.catalogUrl) {
      lines.push("", `Podés ver el catálogo completo acá:`, result.catalogUrl);
    }
    return lines.join("\n");
  }

  const lines: string[] = [
    options?.headline ??
      `Encontré *${result.total}* propiedad${result.total === 1 ? "" : "es"} de ${verb}${
        result.filtersApplied.zone
          ? ` cerca de *${result.filtersApplied.zone}*`
          : ""
      }:`,
    "",
  ];

  result.items.forEach((item, idx) => {
    const typeLabel = PROPERTY_TYPE_LABELS[item.propertyType] ?? item.propertyType;
    const rooms =
      item.rooms != null ? ` · ${item.rooms} amb.` : "";
    lines.push(
      `*${idx + 1}. ${item.title}*`,
      `${typeLabel}${rooms} · ${item.city}`,
      `${item.priceLabel}`,
    );
    if (item.publicUrl) lines.push(item.publicUrl);
    lines.push("");
  });

  if (result.total > result.items.length) {
    lines.push(
      `… y ${result.total - result.items.length} más en el sistema.`,
      "",
    );
  }
  if (result.catalogUrl) {
    lines.push(`Catálogo: ${result.catalogUrl}`);
  }

  return lines.join("\n").trim();
}

export async function countCatalogProperties(
  organizationId: string,
  intent: "BUY" | "RENT",
): Promise<number> {
  return prisma.property.count({
    where: {
      organizationId,
      status: { in: ["AVAILABLE", "RESERVED"] },
      operationType: { in: operationFilter(intent) },
    },
  });
}
