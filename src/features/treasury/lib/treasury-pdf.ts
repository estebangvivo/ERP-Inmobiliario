// DEPENDENCIA: ejecutar `npm install pdf-lib` en el proyecto (no incluida aún en package.json).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney, PAYMENT_METHOD_LABEL, TREASURY_STATUS_LABEL } from "@/features/treasury/lib/labels";
import { formatDateAR } from "@/lib/format-date";
import type { TreasuryDocStatus, TreasuryPaymentMethod } from "@prisma/client";

export type TreasuryPdfPayment = {
  method: TreasuryPaymentMethod;
  amount: number;
  checkNumber?: string | null;
  checkBank?: string | null;
  isElectronicCheck?: boolean;
  bankAccountName?: string | null;
};

export type TreasuryPdfLine = {
  description: string;
  contractLabel?: string | null;
  propertyLabel?: string | null;
  amount: number;
};

export type TreasuryPdfInput = {
  kind: "receipt" | "payment-order";
  number: string;
  status: TreasuryDocStatus;
  issueDate: Date | string;
  partyName: string;
  partyTaxId?: string | null;
  totalAmount: number;
  currency: string;
  concept?: string | null;
  notes?: string | null;
  organizationName: string;
  organizationTaxId?: string | null;
  organizationAddress?: string | null;
  organizationLogo?: {
    bytes: Uint8Array;
    format: "png" | "jpg";
  } | null;
  payments: TreasuryPdfPayment[];
  lines: TreasuryPdfLine[];
};

const MARGIN = 48;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function sanitizePdfText(value: string): string {
  return value
    .replace(/\u2013|\u2014/g, "-")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  lineHeight = size * 1.35,
) {
  const words = sanitizePdfText(text).split(/\s+/);
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: cursorY, size, font });
      cursorY -= lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) page.drawText(line, { x, y: cursorY, size, font });
  return cursorY;
}

export function treasuryPdfFilename(
  kind: "receipt" | "payment-order",
  number: string,
) {
  const prefix = kind === "receipt" ? "recibo" : "orden-pago";
  return `${prefix}-${number.replace(/[^\w-]+/g, "_")}.pdf`;
}

function drawSignatureLines(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  input: TreasuryPdfInput,
  yStart: number,
) {
  let y = Math.min(yStart, 160);
  const partyRole =
    input.kind === "receipt" ? "Inquilino / pagador" : "Beneficiario";
  const colW = (CONTENT_WIDTH - 24) / 2;

  page.drawText("Conformidad y firmas", {
    x: MARGIN,
    y,
    size: 9,
    font: fontBold,
  });
  y -= 28;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + colW, y },
    thickness: 1,
    color: rgb(0.15, 0.15, 0.15),
  });
  page.drawLine({
    start: { x: MARGIN + colW + 24, y },
    end: { x: MARGIN + CONTENT_WIDTH, y },
    thickness: 1,
    color: rgb(0.15, 0.15, 0.15),
  });
  y -= 14;

  page.drawText("Firma de la inmobiliaria", {
    x: MARGIN,
    y,
    size: 9,
    font: fontBold,
  });
  page.drawText(`Firma del ${sanitizePdfText(partyRole).toLowerCase()}`, {
    x: MARGIN + colW + 24,
    y,
    size: 9,
    font: fontBold,
  });
  y -= 12;
  page.drawText("Aclaracion / sello", {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
  page.drawText(sanitizePdfText(input.partyName), {
    x: MARGIN + colW + 24,
    y,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
}

function drawTreasuryPage(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  input: TreasuryPdfInput,
  copyLabel: string,
) {
  let y = PAGE_HEIGHT - MARGIN;
  const title =
    input.kind === "receipt" ? "RECIBO DE COBRO" : "ORDEN DE PAGO";

  page.drawText(sanitizePdfText(copyLabel.toUpperCase()), {
    x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(copyLabel.toUpperCase(), 8),
    y,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
  y -= 18;

  page.drawText(sanitizePdfText(title), {
    x: MARGIN,
    y,
    size: 16,
    font: fontBold,
  });
  y -= 24;

  page.drawText(sanitizePdfText(input.organizationName), {
    x: MARGIN,
    y,
    size: 11,
    font: fontBold,
  });
  y -= 16;

  if (input.organizationAddress) {
    y = drawWrappedText(
      page,
      font,
      input.organizationAddress,
      MARGIN,
      y,
      CONTENT_WIDTH,
      9,
    );
    y -= 8;
  }

  page.drawText(`N° ${sanitizePdfText(input.number)}`, {
    x: MARGIN,
    y,
    size: 10,
    font,
  });
  y -= 14;
  page.drawText(
    `Fecha: ${formatDateAR(input.issueDate)} · Estado: ${TREASURY_STATUS_LABEL[input.status]}`,
    { x: MARGIN, y, size: 9, font },
  );
  y -= 18;

  page.drawText(`Beneficiario / Pagador: ${sanitizePdfText(input.partyName)}`, {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
  });
  y -= 16;

  if (input.concept) {
    y = drawWrappedText(
      page,
      font,
      `Concepto: ${input.concept}`,
      MARGIN,
      y,
      CONTENT_WIDTH,
      9,
    );
    y -= 10;
  }

  page.drawText("Detalle", { x: MARGIN, y, size: 10, font: fontBold });
  y -= 14;

  for (const line of input.lines) {
    const meta = [line.contractLabel, line.propertyLabel]
      .filter(Boolean)
      .join(" · ");
    const text = meta
      ? `${line.description} (${meta})`
      : line.description;
    y = drawWrappedText(page, font, text, MARGIN, y, CONTENT_WIDTH * 0.72, 9);
    page.drawText(formatMoney(line.amount, input.currency), {
      x: PAGE_WIDTH - MARGIN - 80,
      y: y + 9,
      size: 9,
      font,
    });
    y -= 6;
  }

  y -= 8;
  page.drawText("Medios de pago", { x: MARGIN, y, size: 10, font: fontBold });
  y -= 14;
  for (const p of input.payments) {
    const label = PAYMENT_METHOD_LABEL[p.method];
    page.drawText(`${label}: ${formatMoney(p.amount, input.currency)}`, {
      x: MARGIN,
      y,
      size: 9,
      font,
    });
    y -= 12;
  }

  y -= 8;
  page.drawText(`Total: ${formatMoney(input.totalAmount, input.currency)}`, {
    x: MARGIN,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  if (input.notes) {
    y -= 20;
    y = drawWrappedText(
      page,
      font,
      `Notas: ${input.notes}`,
      MARGIN,
      y,
      CONTENT_WIDTH,
      8,
    );
  }

  drawSignatureLines(page, font, fontBold, input, y - 36);
}

/** Genera PDF con 2 ejemplares (original + duplicado) y espacio de firmas. */
export async function buildTreasuryDocPdf(input: TreasuryPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const copyLabel of ["Original", "Duplicado"] as const) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawTreasuryPage(page, font, fontBold, input, copyLabel);
  }

  return pdf.save();
}
