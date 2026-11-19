import type { WhatsAppAgentArea } from "@prisma/client";

export const WHATSAPP_AGENT_AREAS: WhatsAppAgentArea[] = [
  "SALES_RENTALS",
  "WORKS",
  "CONTRACTS",
  "CASH",
];

export const WHATSAPP_AGENT_AREA_LABELS: Record<WhatsAppAgentArea, string> = {
  SALES_RENTALS: "Ventas / Alquileres",
  WORKS: "Obras",
  CONTRACTS: "Contratos",
  CASH: "Caja",
};

export const AREA_MENU_ROWS: Array<{
  id: string;
  area: WhatsAppAgentArea;
  title: string;
  description: string;
}> = [
  {
    id: "area_sales_rentals",
    area: "SALES_RENTALS",
    title: "Ventas / Alquileres",
    description: "Comprar, alquilar o tasar",
  },
  {
    id: "area_works",
    area: "WORKS",
    title: "Obras",
    description: "Mantenimiento y reparaciones",
  },
  {
    id: "area_contracts",
    area: "CONTRACTS",
    title: "Contratos",
    description: "Consultas de contrato",
  },
  {
    id: "area_cash",
    area: "CASH",
    title: "Caja",
    description: "Pagos y cobros",
  },
];

export function areaFromButtonId(id: string): WhatsAppAgentArea | null {
  const row = AREA_MENU_ROWS.find((r) => r.id === id);
  return row?.area ?? null;
}

export function isWhatsAppAgentArea(value: string): value is WhatsAppAgentArea {
  return (WHATSAPP_AGENT_AREAS as string[]).includes(value);
}

/** Normaliza texto para matching (minúsculas, sin tildes). */
export function normalizeWhatsAppMatchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Detecta área por palabras completas (evita falsos positivos:
 * p. ej. "cobranzas" no debe matchear "obra").
 */
export function matchAreaFromFreeText(
  text: string,
): WhatsAppAgentArea | null {
  const t = normalizeWhatsAppMatchText(text);
  if (!t) return null;

  // Más específico primero: cobros/caja antes que obras.
  if (
    /\b(cobranzas?|cobros?|pagos?|caja|facturas?|recibos?)\b/.test(t)
  ) {
    return "CASH";
  }
  if (
    /\b(obras?|mantenimiento|reparacion(?:es)?|plomeria|electricidad|rotura)\b/.test(
      t,
    )
  ) {
    return "WORKS";
  }
  if (/\b(contratos?|rescision|garantia)\b/.test(t)) {
    return "CONTRACTS";
  }
  if (
    /\b(ventas?|alquiler(?:es)?|comprar|tasar|tasacion|inmueble|propiedad)\b/.test(
      t,
    )
  ) {
    return "SALES_RENTALS";
  }
  return null;
}

export function matchSalesIntentFromFreeText(
  text: string,
): "BUY" | "RENT" | "APPRAISE" | null {
  const t = normalizeWhatsAppMatchText(text);
  if (!t) return null;
  if (/\b(comprar|compra)\b/.test(t)) return "BUY";
  if (/\b(alquilar|alquiler(?:es)?)\b/.test(t)) return "RENT";
  if (/\b(tasar|tasacion|valuar|valuacion)\b/.test(t)) return "APPRAISE";
  return null;
}
