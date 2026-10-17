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
