import { prisma } from "@/lib/prisma";
import {
  generateBillsForPeriod,
  syncOverdueBills,
} from "@/server/services/billing";
import { generateOwnerSettlement } from "@/server/services/settlements";

export async function runMonthlyBillingJob(input?: {
  year?: number;
  month?: number;
  organizationId?: string;
}) {
  const now = new Date();
  const year = input?.year ?? now.getFullYear();
  const month = input?.month ?? now.getMonth() + 1;

  const orgs = await prisma.organization.findMany({
    where: input?.organizationId
      ? { id: input.organizationId }
      : {
          contracts: { some: { status: "ACTIVE" } },
        },
    select: { id: true, name: true },
  });

  const results: {
    organizationId: string;
    name: string;
    bills: number;
    overdueSynced: number;
    error?: string;
  }[] = [];

  for (const org of orgs) {
    try {
      const bills = await generateBillsForPeriod(org.id, year, month);
      const overdueSynced = await syncOverdueBills(org.id);
      results.push({
        organizationId: org.id,
        name: org.name,
        bills: bills.length,
        overdueSynced,
      });
    } catch (e) {
      results.push({
        organizationId: org.id,
        name: org.name,
        bills: 0,
        overdueSynced: 0,
        error: e instanceof Error ? e.message : "Error",
      });
    }
  }

  return { year, month, results };
}

/** Owners con ownership y pagos del período sin rendición (cualquier moneda). */
export async function listOwnersPendingSettlement(input: {
  organizationId: string;
  periodYear: number;
  periodMonth: number;
}) {
  const owners = await prisma.propertyOwnership.findMany({
    where: {
      property: { organizationId: input.organizationId },
    },
    select: {
      ownerId: true,
      owner: { select: { id: true, name: true } },
    },
    distinct: ["ownerId"],
  });

  const periodStart = new Date(
    Date.UTC(input.periodYear, input.periodMonth - 1, 1),
  );
  const periodEnd = new Date(
    Date.UTC(input.periodYear, input.periodMonth, 1),
  );

  const pending: { id: string; name: string }[] = [];

  for (const row of owners) {
    const hasPayments = await prisma.payment.findFirst({
      where: {
        paidAt: { gte: periodStart, lt: periodEnd },
        tenantBill: {
          contract: {
            property: {
              organizationId: input.organizationId,
              ownerships: { some: { ownerId: row.ownerId } },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!hasPayments) continue;

    const settlement = await prisma.ownerSettlement.findFirst({
      where: {
        organizationId: input.organizationId,
        ownerId: row.ownerId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
      },
      select: { id: true },
    });
    if (!settlement) {
      pending.push({ id: row.owner.id, name: row.owner.name });
    }
  }

  return pending;
}

export async function generateSettlementsForPeriod(input: {
  organizationId: string;
  periodYear: number;
  periodMonth: number;
  currency?: "ARS" | "USD" | "EUR";
}) {
  const currency = input.currency ?? "ARS";
  const owners = await prisma.propertyOwnership.findMany({
    where: { property: { organizationId: input.organizationId } },
    select: { ownerId: true },
    distinct: ["ownerId"],
  });

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const { ownerId } of owners) {
    try {
      const s = await generateOwnerSettlement({
        organizationId: input.organizationId,
        ownerId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        currency,
      });
      created.push(s.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      if (msg.includes("Ya existe")) skipped.push(ownerId);
      else errors.push(`${ownerId}: ${msg}`);
    }
  }

  return { created: created.length, skipped: skipped.length, errors };
}
