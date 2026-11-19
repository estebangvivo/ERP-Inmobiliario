/**
 * Abre cargos RecoverableCharge para facturas AGENCY_RECOVERABLE ya pagadas
 * que aún no tienen ledger.
 *
 * Uso: npx tsx scripts/backfill-recoverable-charges.ts
 */
import { PrismaClient } from "@prisma/client";
import { openRecoverableChargesForInvoice } from "../src/server/services/recoverable-charges";

const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      costBearer: "AGENCY_RECOVERABLE",
      paidAt: { not: null },
      recoverableCharges: { none: {} },
    },
    include: {
      workOrder: { select: { organizationId: true, code: true } },
    },
  });

  console.log(`Facturas a backfillear: ${invoices.length}`);

  for (const inv of invoices) {
    const orgId = inv.workOrder.organizationId;
    if (!orgId) {
      console.warn(`Skip ${inv.id}: OT sin organizationId`);
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        await openRecoverableChargesForInvoice(tx, orgId, inv.id);
      });
      console.log(`OK ${inv.workOrder.code} · ${inv.id}`);
    } catch (e) {
      console.error(
        `FAIL ${inv.workOrder.code}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
