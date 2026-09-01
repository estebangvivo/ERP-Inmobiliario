import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BILL_STATUS_LABELS } from "@/lib/labels";
import { formatDateAR } from "@/lib/format-date";
import { formatMoney } from "@/lib/money";
import type { BillStatus, Currency } from "@prisma/client";
import type { TenantDebtPrintData } from "@/features/billing/lib/tenant-debt-print-data";
import { loadOrganizationLogoBytes } from "@/features/settings/lib/organization-logo-server";

const MARGIN = 48;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const KIND_LABEL = {
  RENT: "Alquiler",
  SERVICES: "Servicios",
} as const;

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
): number {
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

function statusLabel(status: string): string {
  return BILL_STATUS_LABELS[status as BillStatus] ?? status;
}

export async function buildTenantDebtPdf(
  data: TenantDebtPrintData,
  logoUrl: string | null,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadOrganizationLogoBytes(logoUrl);

  let y = PAGE_HEIGHT - MARGIN;

  if (logo) {
    const img =
      logo.format === "png"
        ? await pdf.embedPng(logo.bytes)
        : await pdf.embedJpg(logo.bytes);
    const scale = Math.min(120 / img.width, 56 / img.height, 1);
    page.drawImage(img, {
      x: MARGIN,
      y: y - img.height * scale,
      width: img.width * scale,
      height: img.height * scale,
    });
    y -= img.height * scale + 12;
  }

  page.drawText("ESTADO DE DEUDA", {
    x: MARGIN,
    y,
    size: 16,
    font: fontBold,
  });
  y -= 22;

  page.drawText(sanitizePdfText(data.organizationName), {
    x: MARGIN,
    y,
    size: 11,
    font: fontBold,
  });
  y -= 14;

  if (data.organizationTaxId) {
    page.drawText(`CUIT: ${sanitizePdfText(data.organizationTaxId)}`, {
      x: MARGIN,
      y,
      size: 9,
      font,
    });
    y -= 12;
  }

  if (data.organizationAddress) {
    y = drawWrappedText(
      page,
      font,
      data.organizationAddress,
      MARGIN,
      y,
      CONTENT_WIDTH,
      9,
    );
    y -= 10;
  }

  page.drawText(`Emitido: ${formatDateAR(data.issueDate)}`, {
    x: MARGIN,
    y,
    size: 9,
    font,
  });
  y -= 18;

  page.drawText(`Inquilino: ${sanitizePdfText(data.tenant.name)}`, {
    x: MARGIN,
    y,
    size: 10,
    font: fontBold,
  });
  y -= 14;

  if (data.tenant.documentNumber) {
    page.drawText(`DNI/CUIT: ${sanitizePdfText(data.tenant.documentNumber)}`, {
      x: MARGIN,
      y,
      size: 9,
      font,
    });
    y -= 12;
  }

  page.drawText(sanitizePdfText(data.tenant.email), {
    x: MARGIN,
    y,
    size: 9,
    font,
  });
  y -= 12;

  if (data.tenant.phone) {
    page.drawText(sanitizePdfText(data.tenant.phone), {
      x: MARGIN,
      y,
      size: 9,
      font,
    });
    y -= 12;
  }

  y -= 6;
  const currencies = Object.keys(data.balanceByCurrency);
  if (currencies.length === 0) {
    page.drawText("Sin deuda pendiente", { x: MARGIN, y, size: 10, font });
  } else {
    const totals = currencies
      .map((c) =>
        `${formatMoney(data.balanceByCurrency[c]!, c as Currency)} (${c})`,
      )
      .join(" · ");
    page.drawText(`Saldo total: ${sanitizePdfText(totals)}`, {
      x: MARGIN,
      y,
      size: 11,
      font: fontBold,
    });
    y -= 20;

    page.drawText("Cuotas pendientes", {
      x: MARGIN,
      y,
      size: 10,
      font: fontBold,
    });
    y -= 14;

    for (const bill of data.bills) {
      if (y < MARGIN + 80) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }

      const title = `${bill.installmentLabel} · ${KIND_LABEL[bill.kind]} · ${bill.contractCode}`;
      y = drawWrappedText(page, fontBold, title, MARGIN, y, CONTENT_WIDTH * 0.65, 9);
      page.drawText(
        formatMoney(bill.balance, bill.currency as Currency),
        {
          x: PAGE_WIDTH - MARGIN - 90,
          y: y + 10,
          size: 9,
          font: fontBold,
        },
      );

      const meta = [
        bill.propertyTitle,
        `Vence: ${formatDateAR(bill.dueDate)}`,
        statusLabel(bill.status),
      ].join(" · ");
      y = drawWrappedText(page, font, meta, MARGIN, y - 2, CONTENT_WIDTH, 8);
      if (bill.paidAmount > 0.001) {
        y = drawWrappedText(
          page,
          font,
          `Pagado: ${formatMoney(bill.paidAmount, bill.currency as Currency)}`,
          MARGIN,
          y - 2,
          CONTENT_WIDTH,
          8,
        );
      }
      y -= 4;

      for (const line of bill.lines) {
        if (y < MARGIN + 40) {
          page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = PAGE_HEIGHT - MARGIN;
        }
        page.drawText(`  ${sanitizePdfText(line.label)}`, {
          x: MARGIN + 8,
          y,
          size: 8,
          font,
        });
        page.drawText(
          formatMoney(line.amount, bill.currency as Currency),
          {
            x: PAGE_WIDTH - MARGIN - 90,
            y,
            size: 8,
            font,
          },
        );
        y -= 12;
      }

      if (y < MARGIN + 30) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText("  Subtotal cuota", {
        x: MARGIN + 8,
        y,
        size: 8,
        font: fontBold,
      });
      page.drawText(
        formatMoney(bill.balance, bill.currency as Currency),
        {
          x: PAGE_WIDTH - MARGIN - 90,
          y,
          size: 8,
          font: fontBold,
        },
      );
      y -= 16;
    }

    y -= 6;
    for (const currency of currencies) {
      if (y < MARGIN + 40) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(
        `Total adeudado (${currency}): ${formatMoney(data.balanceByCurrency[currency]!, currency as Currency)}`,
        {
          x: MARGIN,
          y,
          size: 11,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1),
        },
      );
      y -= 16;
    }
  }

  y -= 8;
  if (y < MARGIN + 30) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }
  drawWrappedText(
    page,
    font,
    "Documento informativo de deuda pendiente. Los montos pueden variar hasta la fecha de pago.",
    MARGIN,
    y,
    CONTENT_WIDTH,
    8,
  );

  return pdf.save();
}
