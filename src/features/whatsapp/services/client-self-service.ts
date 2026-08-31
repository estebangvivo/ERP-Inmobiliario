import type { Currency } from "@prisma/client";
import type { WhatsAppContactProfile } from "@/features/whatsapp/services/contact-lookup-service";
import { formatDateOnly } from "@/lib/dates";
import {
  BILL_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  PARTY_ROLE_LABELS,
  PROPERTY_STATUS_LABELS,
} from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { getTenantDebtDetail } from "@/server/services/tenant-ledger";

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function periodLabel(month: number, year: number): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

export async function buildClientDebtsMessage(
  organizationId: string,
  userId: string,
): Promise<string> {
  const detail = await getTenantDebtDetail(organizationId, userId);
  if (!detail || detail.bills.length === 0) {
    return "No tenés cuotas pendientes registradas. ✅";
  }

  const lines = ["*Tus cuotas pendientes:*", ""];
  for (const bill of detail.bills.slice(0, 6)) {
    lines.push(
      `• ${bill.contractCode} — ${bill.propertyTitle}`,
      `  ${periodLabel(bill.periodMonth, bill.periodYear)} · ${formatMoney(bill.balance, bill.currency as Currency)}`,
      `  Vence: ${formatDateOnly(bill.dueDate)} · ${BILL_STATUS_LABELS[bill.status as keyof typeof BILL_STATUS_LABELS] ?? bill.status}`,
      "",
    );
  }

  if (detail.bills.length > 6) {
    lines.push(`… y ${detail.bills.length - 6} cuota(s) más.`, "");
  }

  for (const [currency, amount] of Object.entries(detail.balanceByCurrency)) {
    lines.push(
      `*Total pendiente ${currency}:* ${formatMoney(amount, currency as Currency)}`,
    );
  }

  lines.push("", "Para más detalle ingresá al portal en Cobros.");
  return lines.join("\n");
}

export function buildClientContractsMessage(
  profile: WhatsAppContactProfile,
): string {
  if (profile.contracts.length === 0) {
    return "No encontramos contratos registrados a tu nombre.";
  }

  const lines = ["*Tus contratos:*", ""];
  for (const c of profile.contracts.slice(0, 6)) {
    const status =
      CONTRACT_STATUS_LABELS[
        c.status as keyof typeof CONTRACT_STATUS_LABELS
      ] ?? c.status;
    lines.push(
      `• *${c.code}* — ${c.propertyTitle}`,
      `  Rol: ${PARTY_ROLE_LABELS[c.partyRole]}`,
      `  Estado: ${status}`,
      `  Desde ${formatDateOnly(c.startDate)}${c.endDate ? ` hasta ${formatDateOnly(c.endDate)}` : ""}`,
      `  Alquiler: ${formatMoney(c.initialRent, c.currency as Currency)}`,
      "",
    );
  }

  if (profile.contracts.length > 6) {
    lines.push(`… y ${profile.contracts.length - 6} contrato(s) más.`);
  }

  return lines.join("\n");
}

export function buildClientPropertiesMessage(
  profile: WhatsAppContactProfile,
): string {
  const lines: string[] = [];

  if (profile.ownedProperties.length > 0) {
    lines.push("*Propiedades en tu nombre (propietario):*", "");
    for (const p of profile.ownedProperties.slice(0, 6)) {
      const status =
        PROPERTY_STATUS_LABELS[
          p.status as keyof typeof PROPERTY_STATUS_LABELS
        ] ?? p.status;
      lines.push(`• ${p.title} — ${status}`);
    }
    lines.push("");
  }

  if (profile.rentedProperties.length > 0) {
    lines.push("*Propiedades que alquilás:*", "");
    for (const p of profile.rentedProperties.slice(0, 6)) {
      const status =
        PROPERTY_STATUS_LABELS[
          p.status as keyof typeof PROPERTY_STATUS_LABELS
        ] ?? p.status;
      lines.push(`• ${p.title} — ${status}`);
    }
    lines.push("");
  }

  if (lines.length === 0) {
    return "No encontramos propiedades vinculadas a tu usuario.";
  }

  return lines.join("\n").trim();
}
