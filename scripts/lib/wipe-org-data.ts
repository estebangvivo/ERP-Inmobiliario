import type { PrismaClient } from "@prisma/client";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

/** Borra documentos de tesorería y movimientos de una organización. */
export async function wipeOrgTreasury(
  prisma: PrismaClient | Tx,
  organizationId: string,
) {
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

  // Cheques / bancos antes de borrar recibos y OP (FKs).
  await prisma.checkRejectionFee.deleteMany({ where: { organizationId } });
  await prisma.bankMovement.deleteMany({ where: { organizationId } });
  await prisma.checkInstrument.deleteMany({ where: { organizationId } });

  if (receiptIds.length) {
    await prisma.receiptBillApplication.deleteMany({
      where: { receiptId: { in: receiptIds } },
    });
    // Cascade también, pero explícito por claridad ante Restrict en otras tablas.
    await prisma.receiptPayment.deleteMany({
      where: { receiptId: { in: receiptIds } },
    });
    await prisma.receiptLine.deleteMany({
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
    await prisma.paymentOrderPayment.deleteMany({
      where: { paymentOrderId: { in: paymentOrderIds } },
    });
    await prisma.paymentOrderLine.deleteMany({
      where: { paymentOrderId: { in: paymentOrderIds } },
    });
  }

  // Pagos de cuota ligados a recibo: desvincular antes de borrar recibos.
  if (receiptIds.length) {
    await prisma.payment.updateMany({
      where: { receiptId: { in: receiptIds } },
      data: { receiptId: null },
    });
  }

  await prisma.paymentOrder.deleteMany({ where: { organizationId } });
  await prisma.receipt.deleteMany({ where: { organizationId } });

  await prisma.cashSession.deleteMany({ where: { organizationId } });

  await prisma.cashRegister.updateMany({
    where: { organizationId },
    data: { balance: 0 },
  });
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
    await prisma.contractAttachment.deleteMany({
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

  const workOrders = await prisma.workOrder.findMany({
    where: { organizationId },
    select: { id: true },
  });
  if (workOrders.length) {
    await prisma.supplierInvoice.deleteMany({
      where: { workOrderId: { in: workOrders.map((w) => w.id) } },
    });
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

/**
 * Borra lo operativo (contratos, cobros, tesorería, obras, leads, WhatsApp, turnero…)
 * y conserva catálogo: personas, propiedades, fotos, ownerships, edificios/unidades.
 */
export async function wipeOrgKeepCatalog(
  prisma: PrismaClient | Tx,
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

  // Obras antes de contratos (FK contractId opcional).
  const workOrders = await prisma.workOrder.findMany({
    where: { organizationId },
    select: { id: true },
  });
  if (workOrders.length) {
    await prisma.supplierInvoice.deleteMany({
      where: { workOrderId: { in: workOrders.map((w) => w.id) } },
    });
  }
  await prisma.workOrder.deleteMany({ where: { organizationId } });

  if (contractIds.length) {
    await prisma.contractAttachment.deleteMany({
      where: { contractId: { in: contractIds } },
    });
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
  await prisma.indexRate.deleteMany({ where: { organizationId } });

  const expenses = await prisma.expense.findMany({
    where: { organizationId },
    select: { id: true },
  });
  if (expenses.length) {
    await prisma.expenseAllocation.deleteMany({
      where: { expenseId: { in: expenses.map((e) => e.id) } },
    });
  }
  await prisma.expense.deleteMany({ where: { organizationId } });

  // Visitas / ventas / leads
  await prisma.propertyVisitBooking.deleteMany({ where: { organizationId } });
  await prisma.saleDeal.deleteMany({ where: { organizationId } });

  // WhatsApp + desk
  const waSessions = await prisma.whatsAppChatSession.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const waSessionIds = waSessions.map((s) => s.id);
  const deskThreads = await prisma.agentDeskThread.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const deskThreadIds = deskThreads.map((t) => t.id);
  if (deskThreadIds.length) {
    await prisma.agentDeskMessage.deleteMany({
      where: { threadId: { in: deskThreadIds } },
    });
    await prisma.agentDeskParticipant.deleteMany({
      where: { threadId: { in: deskThreadIds } },
    });
  }
  await prisma.agentDeskThread.deleteMany({ where: { organizationId } });
  if (waSessionIds.length) {
    await prisma.whatsAppMessage.deleteMany({
      where: { sessionId: { in: waSessionIds } },
    });
  }
  await prisma.whatsAppChatSession.deleteMany({ where: { organizationId } });
  await prisma.lead.deleteMany({ where: { organizationId } });

  // Turnero
  await prisma.turneroTurno.deleteMany({ where: { organizationId } });
  await prisma.turneroContadorDiario.deleteMany({ where: { organizationId } });
  await prisma.turneroCliente.deleteMany({ where: { organizationId } });
  await prisma.turneroPuesto.deleteMany({ where: { organizationId } });

  // Sin contrato activo: reabrir alquiladas
  await prisma.property.updateMany({
    where: { organizationId, status: "RENTED" },
    data: { status: "AVAILABLE" },
  });
}

export type OrgCleanupCounts = {
  contracts: number;
  tenantBills: number;
  payments: number;
  receipts: number;
  paymentOrders: number;
  settlements: number;
  workOrders: number;
  supplierInvoices: number;
  expenses: number;
  serviceCosts: number;
  indexRates: number;
  leads: number;
  visitBookings: number;
  saleDeals: number;
  whatsappSessions: number;
  whatsappMessages: number;
  deskThreads: number;
  turneroTurnos: number;
  checkInstruments: number;
  bankMovements: number;
  cashMovements: number;
  properties: number;
  propertiesRented: number;
  ownerships: number;
  members: number;
  complexes: number;
  units: number;
};

export async function countOrgCleanupTargets(
  prisma: PrismaClient | Tx,
  organizationId: string,
): Promise<OrgCleanupCounts> {
  const contractIds = (
    await prisma.contract.findMany({
      where: { organizationId },
      select: { id: true },
    })
  ).map((c) => c.id);

  const billIds = contractIds.length
    ? (
        await prisma.tenantBill.findMany({
          where: { contractId: { in: contractIds } },
          select: { id: true },
        })
      ).map((b) => b.id)
    : [];

  const workOrderIds = (
    await prisma.workOrder.findMany({
      where: { organizationId },
      select: { id: true },
    })
  ).map((w) => w.id);

  const waSessionIds = (
    await prisma.whatsAppChatSession.findMany({
      where: { organizationId },
      select: { id: true },
    })
  ).map((s) => s.id);

  const [
    contracts,
    tenantBills,
    payments,
    receipts,
    paymentOrders,
    settlements,
    workOrders,
    supplierInvoices,
    expenses,
    serviceCosts,
    indexRates,
    leads,
    visitBookings,
    saleDeals,
    whatsappSessions,
    whatsappMessages,
    deskThreads,
    turneroTurnos,
    checkInstruments,
    bankMovements,
    cashMovements,
    properties,
    propertiesRented,
    ownerships,
    members,
    complexes,
    units,
  ] = await Promise.all([
    prisma.contract.count({ where: { organizationId } }),
    billIds.length
      ? prisma.tenantBill.count({ where: { id: { in: billIds } } })
      : Promise.resolve(0),
    billIds.length
      ? prisma.payment.count({ where: { tenantBillId: { in: billIds } } })
      : Promise.resolve(0),
    prisma.receipt.count({ where: { organizationId } }),
    prisma.paymentOrder.count({ where: { organizationId } }),
    prisma.ownerSettlement.count({ where: { organizationId } }),
    prisma.workOrder.count({ where: { organizationId } }),
    workOrderIds.length
      ? prisma.supplierInvoice.count({
          where: { workOrderId: { in: workOrderIds } },
        })
      : Promise.resolve(0),
    prisma.expense.count({ where: { organizationId } }),
    prisma.serviceCost.count({ where: { organizationId } }),
    prisma.indexRate.count({ where: { organizationId } }),
    prisma.lead.count({ where: { organizationId } }),
    prisma.propertyVisitBooking.count({ where: { organizationId } }),
    prisma.saleDeal.count({ where: { organizationId } }),
    prisma.whatsAppChatSession.count({ where: { organizationId } }),
    waSessionIds.length
      ? prisma.whatsAppMessage.count({
          where: { sessionId: { in: waSessionIds } },
        })
      : Promise.resolve(0),
    prisma.agentDeskThread.count({ where: { organizationId } }),
    prisma.turneroTurno.count({ where: { organizationId } }),
    prisma.checkInstrument.count({ where: { organizationId } }),
    prisma.bankMovement.count({ where: { organizationId } }),
    prisma.cashMovement.count({ where: { organizationId } }),
    prisma.property.count({ where: { organizationId } }),
    prisma.property.count({ where: { organizationId, status: "RENTED" } }),
    prisma.propertyOwnership.count({
      where: { property: { organizationId } },
    }),
    prisma.organizationMember.count({ where: { organizationId } }),
    prisma.complex.count({ where: { organizationId } }),
    prisma.unit.count({ where: { complex: { organizationId } } }),
  ]);

  return {
    contracts,
    tenantBills,
    payments,
    receipts,
    paymentOrders,
    settlements,
    workOrders,
    supplierInvoices,
    expenses,
    serviceCosts,
    indexRates,
    leads,
    visitBookings,
    saleDeals,
    whatsappSessions,
    whatsappMessages,
    deskThreads,
    turneroTurnos,
    checkInstruments,
    bankMovements,
    cashMovements,
    properties,
    propertiesRented,
    ownerships,
    members,
    complexes,
    units,
  };
}
