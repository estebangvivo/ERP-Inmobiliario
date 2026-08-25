import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@prisma/client";

export type VisitMessageContext = {
  orgName: string;
  visitorName: string;
  propertyTitle: string;
  timeLabel: string;
  dateLabel: string;
};

export type LeadMessageContext = {
  orgName: string;
  leadName: string;
  propertyTitle: string | null;
};

export type MoraMessageContext = {
  orgName: string;
  propertyTitle: string;
  balance: string;
  currency: string;
  dueDate: string;
};

export function buildVisitConfirmMessage(ctx: VisitMessageContext): string {
  return `Hola ${ctx.visitorName}, te escribo de ${ctx.orgName}. Confirmamos tu visita a ${ctx.propertyTitle} el ${ctx.dateLabel} a las ${ctx.timeLabel}. ¿Te queda bien? Cualquier cambio avisanos por acá.`;
}

export function buildLeadReplyMessage(ctx: LeadMessageContext): string {
  const ref = ctx.propertyTitle
    ? ` sobre ${ctx.propertyTitle}`
    : " por tu consulta";
  return `Hola ${ctx.leadName}, te escribo de ${ctx.orgName}. Recibimos tu mensaje${ref}. ¿Cuándo te queda cómodo que hablemos?`;
}

export function buildMoraReminderMessage(ctx: MoraMessageContext): string {
  const due = formatDateOnly(new Date(ctx.dueDate));
  const amount = formatMoney(ctx.balance, ctx.currency as Currency);
  return `Hola, te escribimos de ${ctx.orgName} por la cuota pendiente de ${ctx.propertyTitle} (venc. ${due}, saldo ${amount}). ¿Podemos coordinar el pago? Gracias.`;
}
