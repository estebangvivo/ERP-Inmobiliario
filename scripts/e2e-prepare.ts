/**
 * Prepara datos estables para E2E: cuenta bancaria, caja abierta y cuota pendiente.
 * Escribe e2e/.fixtures.json consumido por los tests transversales.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  ensureCashRegisters,
  nextCashSessionNumber,
} from "../src/features/treasury/lib/cash-helpers";
import { alignContractPropertyOwners } from "./lib/align-contract-owners";

const prisma = new PrismaClient();

const ORG_SLUG = "demo-inmobiliaria";
const CONTRACT_CODE = "CTR-2026-001";
const BANK_NAME = "E2E Test ARS";
const E2E_BILL_RENT = 650000;
const E2E_BILL_EXPENSES = 45000;
const E2E_BILL_TOTAL = E2E_BILL_RENT + E2E_BILL_EXPENSES;

async function resetPaidBill(billId: string) {
  const bill = await prisma.tenantBill.findUnique({
    where: { id: billId },
    include: { payments: { select: { id: true, receiptId: true } } },
  });
  if (!bill || Number(bill.paidAmount) <= 0) return;

  const receiptIds = [
    ...new Set(
      bill.payments
        .map((p) => p.receiptId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  await prisma.receiptBillApplication.deleteMany({ where: { tenantBillId: billId } });
  await prisma.payment.deleteMany({ where: { tenantBillId: billId } });

  for (const receiptId of receiptIds) {
    await prisma.cashMovement.deleteMany({ where: { receiptId } });
    await prisma.receipt.delete({ where: { id: receiptId } }).catch(() => {});
  }

  await prisma.tenantBill.update({
    where: { id: billId },
    data: { paidAmount: 0, status: "PENDING" },
  });
}

async function resetContractBillingState(contractId: string) {
  const bills = await prisma.tenantBill.findMany({
    where: { contractId },
    select: { id: true },
  });
  for (const { id } of bills) {
    await resetPaidBill(id);
  }
}

async function resetOwnerSettlementsForPeriod(
  organizationId: string,
  ownerId: string,
  periodYear: number,
  periodMonth: number,
) {
  const settlements = await prisma.ownerSettlement.findMany({
    where: {
      organizationId,
      ownerId,
      periodYear,
      periodMonth,
      currency: "ARS",
    },
    select: { id: true },
  });
  if (settlements.length === 0) return;

  const settlementIds = settlements.map((s) => s.id);
  const poApps = await prisma.paymentOrderSettlementApplication.findMany({
    where: { ownerSettlementId: { in: settlementIds } },
    select: { paymentOrderId: true },
  });
  const paymentOrderIds = [...new Set(poApps.map((a) => a.paymentOrderId))];

  for (const paymentOrderId of paymentOrderIds) {
    await prisma.cashMovement.deleteMany({ where: { paymentOrderId } });
    await prisma.paymentOrder.delete({ where: { id: paymentOrderId } }).catch(() => {});
  }

  await prisma.ownerSettlement.deleteMany({
    where: { id: { in: settlementIds } },
  });
}

async function ensurePendingBill(contractId: string, periodYear: number, periodMonth: number) {
  const existing = await prisma.tenantBill.findUnique({
    where: {
      contractId_periodYear_periodMonth_kind: {
        contractId,
        periodYear,
        periodMonth,
        kind: "RENT",
      },
    },
  });

  if (existing) {
    await resetPaidBill(existing.id);
    return prisma.tenantBill.update({
      where: { id: existing.id },
      data: {
        rentAmount: E2E_BILL_RENT,
        expensesAmount: E2E_BILL_EXPENSES,
        lateFeeAmount: 0,
        otherAmount: 0,
        totalAmount: E2E_BILL_TOTAL,
        paidAmount: 0,
        status: "PENDING",
        dueDate: new Date(periodYear, periodMonth - 1, 10),
      },
    });
  }

  return prisma.tenantBill.create({
    data: {
      contractId,
      kind: "RENT",
      periodYear,
      periodMonth,
      dueDate: new Date(periodYear, periodMonth - 1, 10),
      rentAmount: E2E_BILL_RENT,
      expensesAmount: E2E_BILL_EXPENSES,
      lateFeeAmount: 0,
      otherAmount: 0,
      totalAmount: E2E_BILL_TOTAL,
      paidAmount: 0,
      currency: "ARS",
      status: "PENDING",
    },
  });
}

async function resetOwnerPaymentsInPeriod(
  organizationId: string,
  ownerId: string,
  periodYear: number,
  periodMonth: number,
) {
  const periodStart = new Date(Date.UTC(periodYear, periodMonth - 1, 1));
  const periodEnd = new Date(Date.UTC(periodYear, periodMonth, 1));

  const propertyIds = (
    await prisma.propertyOwnership.findMany({
      where: { ownerId, property: { organizationId } },
      select: { propertyId: true },
    })
  ).map((o) => o.propertyId);
  if (propertyIds.length === 0) return;

  const payments = await prisma.payment.findMany({
    where: {
      paidAt: { gte: periodStart, lt: periodEnd },
      tenantBill: { contract: { propertyId: { in: propertyIds } } },
    },
    select: { tenantBillId: true },
  });

  const billIds = [...new Set(payments.map((p) => p.tenantBillId))];
  for (const billId of billIds) {
    await resetPaidBill(billId);
  }
}

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: ORG_SLUG },
    select: { id: true },
  });
  if (!org) {
    throw new Error(
      `Organización ${ORG_SLUG} no encontrada. Ejecutá: npm run db:seed`,
    );
  }

  await alignContractPropertyOwners(prisma, org.id);

  const admin = await prisma.user.findFirst({
    where: { email: "admin@erp.local" },
    select: { id: true },
  });
  if (!admin) throw new Error("Usuario admin@erp.local no encontrado.");

  const contract = await prisma.contract.findFirst({
    where: {
      organizationId: org.id,
      code: CONTRACT_CODE,
    },
    select: {
      id: true,
      property: {
        select: {
          ownerships: {
            orderBy: [{ isPrimary: "desc" }, { sharePct: "desc" }],
            take: 1,
            select: {
              owner: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!contract) {
    throw new Error(`Contrato ${CONTRACT_CODE} no encontrado. Ejecutá: npm run db:seed`);
  }
  const owner = contract.property.ownerships[0]?.owner;
  if (!owner) {
    throw new Error(`El contrato ${CONTRACT_CODE} no tiene propietario titular en la propiedad.`);
  }

  let bank = await prisma.bankAccount.findFirst({
    where: { organizationId: org.id, name: BANK_NAME },
  });
  if (!bank) {
    bank = await prisma.bankAccount.create({
      data: {
        organizationId: org.id,
        name: BANK_NAME,
        bankName: "Banco E2E",
        currency: "ARS",
        isActive: true,
      },
    });
  }

  const { daily } = await ensureCashRegisters(org.id, "ARS");
  const dailyCashBalanceBefore = Number(daily.balance);

  const openSession = await prisma.cashSession.findFirst({
    where: {
      organizationId: org.id,
      registerId: daily.id,
      status: "OPEN",
    },
  });
  if (!openSession) {
    const number = await nextCashSessionNumber(org.id);
    await prisma.cashSession.create({
      data: {
        organizationId: org.id,
        registerId: daily.id,
        number,
        businessDate: new Date(),
        status: "OPEN",
        currency: "ARS",
        openingBalance: 0,
        openedById: admin.id,
      },
    });
  }

  const now = new Date();
  const billPeriodYear = now.getFullYear();
  const billPeriodMonth = now.getMonth() + 1;
  const settlementYear = billPeriodYear;
  const settlementMonth = billPeriodMonth;

  await resetContractBillingState(contract.id);
  await resetOwnerPaymentsInPeriod(
    org.id,
    owner.id,
    settlementYear,
    settlementMonth,
  );
  await resetOwnerSettlementsForPeriod(
    org.id,
    owner.id,
    settlementYear,
    settlementMonth,
  );

  const bill = await ensurePendingBill(contract.id, billPeriodYear, billPeriodMonth);

  const fixtures = {
    contractCode: CONTRACT_CODE,
    billId: bill.id,
    billPeriodYear: bill.periodYear,
    billPeriodMonth: bill.periodMonth,
    billTotalAmount: E2E_BILL_TOTAL,
    ownerName: owner.name,
    ownerId: owner.id,
    settlementPeriodYear: settlementYear,
    settlementPeriodMonth: settlementMonth,
    bankAccountId: bank.id,
    dailyCashBalanceBefore,
  };

  const outPath = join(process.cwd(), "e2e", ".fixtures.json");
  writeFileSync(outPath, JSON.stringify(fixtures, null, 2));
  console.log("E2E fixtures listos:", outPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
