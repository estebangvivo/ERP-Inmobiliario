import type { PrismaClient } from "@prisma/client";

/** Borra documentos de tesorería y movimientos de una organización. */
export async function wipeOrgTreasury(prisma: PrismaClient, organizationId: string) {
  const receipts = await prisma.receipt.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const receiptIds = receipts.map((r) => r.id);

  const paymentOrders = await prisma.paymentOrder.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const paymentOrderIds = paymentOrders.map((p) => p.id);

  if (receiptIds.length) {
    await prisma.receiptBillApplication.deleteMany({
      where: { receiptId: { in: receiptIds } },
    });
  }

  await prisma.cashMovement.deleteMany({ where: { organizationId } });

  if (paymentOrderIds.length) {
    await prisma.paymentOrderSettlementApplication.deleteMany({
      where: { paymentOrderId: { in: paymentOrderIds } },
    });
    await prisma.paymentOrderInvoiceApplication.deleteMany({
      where: { paymentOrderId: { in: paymentOrderIds } },
    });
  }

  await prisma.paymentOrder.deleteMany({ where: { organizationId } });
  await prisma.receipt.deleteMany({ where: { organizationId } });

  await prisma.cashSession.deleteMany({ where: { organizationId } });

  const registers = await prisma.cashRegister.findMany({
    where: { organizationId },
    select: { id: true },
  });
  if (registers.length) {
    await prisma.cashRegister.updateMany({
      where: { organizationId },
      data: { balance: 0 },
    });
  }
}

/** Borra datos operativos (contratos, propiedades, rendiciones, etc.). */
export async function wipeOrgOperational(
  prisma: PrismaClient,
  organizationId: string,
) {
  await wipeOrgTreasury(prisma, organizationId);

  const contracts = await prisma.contract.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const contractIds = contracts.map((c) => c.id);

  const bills = contractIds.length
    ? await prisma.tenantBill.findMany({
        where: { contractId: { in: contractIds } },
        select: { id: true },
      })
    : [];
  const billIds = bills.map((b) => b.id);

  const settlementIds = (
    await prisma.ownerSettlement.findMany({
      where: { organizationId },
      select: { id: true },
    })
  ).map((s) => s.id);

  if (billIds.length) {
    await prisma.payment.deleteMany({ where: { tenantBillId: { in: billIds } } });
    await prisma.tenantBillContractServiceLine.deleteMany({
      where: { tenantBillId: { in: billIds } },
    });
  }

  if (settlementIds.length) {
    await prisma.settlementLineItem.deleteMany({
      where: { settlementId: { in: settlementIds } },
    });
  }
  await prisma.ownerSettlement.deleteMany({ where: { organizationId } });

  if (billIds.length) {
    await prisma.tenantBill.deleteMany({ where: { id: { in: billIds } } });
  }

  if (contractIds.length) {
    await prisma.contractAdjustment.deleteMany({
      where: { contractId: { in: contractIds } },
    });
    await prisma.contractParty.deleteMany({
      where: { contractId: { in: contractIds } },
    });
    await prisma.contractService.deleteMany({
      where: { contractId: { in: contractIds } },
    });
  }
  await prisma.contract.deleteMany({ where: { organizationId } });

  await prisma.serviceCost.deleteMany({ where: { organizationId } });

  const complexes = await prisma.complex.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const complexIds = complexes.map((c) => c.id);

  if (complexIds.length) {
    const expenses = await prisma.expense.findMany({
      where: { complexId: { in: complexIds } },
      select: { id: true },
    });
    if (expenses.length) {
      await prisma.expenseAllocation.deleteMany({
        where: { expenseId: { in: expenses.map((e) => e.id) } },
      });
    }
    await prisma.expense.deleteMany({ where: { organizationId } });
  }

  await prisma.workOrder.deleteMany({ where: { organizationId } });
  await prisma.lead.deleteMany({ where: { organizationId } });

  const propertyIds = (
    await prisma.property.findMany({
      where: { organizationId },
      select: { id: true },
    })
  ).map((p) => p.id);

  if (propertyIds.length) {
    await prisma.propertyImage.deleteMany({
      where: { propertyId: { in: propertyIds } },
    });
    await prisma.propertyOwnership.deleteMany({
      where: { propertyId: { in: propertyIds } },
    });
  }
  await prisma.property.deleteMany({ where: { organizationId } });

  if (complexIds.length) {
    await prisma.unit.deleteMany({ where: { complexId: { in: complexIds } } });
  }
  await prisma.complex.deleteMany({ where: { organizationId } });
}
