import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { formatDateOnly } from "@/lib/dates";
import { BILL_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { getOrganizationSession } from "@/lib/auth";
import { billScopeWhere } from "@/lib/tenant-scope";
import { hasModule } from "@/features/auth/lib/modules";
import { RentReceiptPdfDocument } from "@/components/pdf/rent-receipt-pdf";
import {
  rentBillReceiptPrefix,
  serviceBillReceiptPrefix,
} from "@/features/billing/lib/tenant-bill-kind";
import { formatInstallmentLabel } from "@/features/billing/lib/installment-label";
import { getBillContractServiceLinesForDisplay } from "@/server/services/contract-services-billing";

type Params = Promise<{ id: string }>;

export async function GET(
  _request: Request,
  { params }: { params: Params },
) {
  const session = await getOrganizationSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (
    session.organizationRole !== "ADMIN" &&
    !hasModule(session.allowedModules, "cobros")
  ) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const bill = await prisma.tenantBill.findFirst({
    where: { id, AND: [billScopeWhere(session)] },
    include: {
      contract: {
        include: {
          property: true,
          parties: { include: { user: true } },
        },
      },
      payments: { orderBy: { paidAt: "asc" } },
    },
  });

  if (!bill) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const tenant =
    bill.contract.parties.find((p) => p.role === "TENANT")?.user.name ??
    "Inquilino";

  const isServices = bill.kind === "SERVICES";
  const prefix = isServices ? serviceBillReceiptPrefix() : rentBillReceiptPrefix();
  const receiptCode = `${prefix}-${bill.periodYear}${String(bill.periodMonth).padStart(2, "0")}-${bill.contract.code}`;
  const serviceLines = isServices
    ? (await getBillContractServiceLinesForDisplay(bill.id)).map((line) => ({
        concept: line.concept,
        amount: String(line.amount),
      }))
    : undefined;

  const buffer = await renderToBuffer(
    RentReceiptPdfDocument({
      data: {
        receiptCode,
        documentTitle: isServices
          ? "Liquidación de servicios"
          : "Recibo / Estado de cuenta — Alquiler",
        contractCode: bill.contract.code,
        propertyTitle: bill.contract.property.title,
        propertyAddress: `${bill.contract.property.address}, ${bill.contract.property.city}`,
        tenantName: tenant,
        periodMonth: bill.periodMonth,
        periodYear: bill.periodYear,
        periodLabel: formatInstallmentLabel({
          contractStart: bill.contract.startDate,
          contractEnd: bill.contract.endDate,
          periodYear: bill.periodYear,
          periodMonth: bill.periodMonth,
        }),
        dueDate: formatDateOnly(bill.dueDate),
        currency: bill.currency,
        rentAmount: bill.rentAmount.toString(),
        contractServicesAmount: bill.contractServicesAmount.toString(),
        commissionAmount: bill.commissionAmount.toString(),
        expensesAmount: bill.expensesAmount.toString(),
        lateFeeAmount: bill.lateFeeAmount.toString(),
        otherAmount: bill.otherAmount.toString(),
        totalAmount: bill.totalAmount.toString(),
        paidAmount: bill.paidAmount.toString(),
        status: BILL_STATUS_LABELS[bill.status],
        serviceLines,
        payments: bill.payments.map((p) => ({
          paidAt: formatDateOnly(p.paidAt),
          method: PAYMENT_METHOD_LABELS[p.method],
          amount: p.amount.toString(),
          reference: p.reference,
        })),
      },
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receiptCode}.pdf"`,
    },
  });
}
