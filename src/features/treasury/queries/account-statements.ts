import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";

function toNumber(value: { toNumber(): number } | number): number {
  return typeof value === "number" ? value : value.toNumber();
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type AgingBucket = "b0_30" | "b31_60" | "b61_90" | "b90_plus";
export type AgingSummary = Record<AgingBucket, number>;

export type AccountStatementMovement = {
  id: string;
  date: string;
  kind: "BILL" | "RECEIPT" | "INVOICE" | "PAYMENT_ORDER" | "SETTLEMENT";
  number: string;
  description: string;
  debit: number;
  credit: number;
  currency: string;
  href: string;
};

export type AccountStatement = {
  partyId: string;
  partyName: string;
  currency: string;
  balance: number;
  aging: AgingSummary;
  movements: AccountStatementMovement[];
};

export type AccountPartySummary = {
  id: string;
  name: string;
  balance: number;
  currency: string;
  aging: AgingSummary;
};

type AgingItem = { amount: number; date: Date };

function emptyAging(): AgingSummary {
  return { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 };
}

function parseDbDate(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isoDay(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function agingBucket(asOf: Date, docDate: Date): AgingBucket {
  const days = Math.floor(
    (asOf.getTime() - docDate.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 30) return "b0_30";
  if (days <= 60) return "b31_60";
  if (days <= 90) return "b61_90";
  return "b90_plus";
}

function buildAging(
  debits: AgingItem[],
  credits: AgingItem[],
  asOf: Date,
): AgingSummary {
  const openDebits = debits
    .map((d) => ({ ...d }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const openCredits = credits
    .map((c) => ({ ...c }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let di = 0;
  let ci = 0;
  while (di < openDebits.length && ci < openCredits.length) {
    const apply = Math.min(openDebits[di].amount, openCredits[ci].amount);
    openDebits[di].amount = round2(openDebits[di].amount - apply);
    openCredits[ci].amount = round2(openCredits[ci].amount - apply);
    if (openDebits[di].amount <= 0.009) di += 1;
    if (openCredits[ci].amount <= 0.009) ci += 1;
  }

  const aging = emptyAging();
  for (const d of openDebits) {
    if (d.amount <= 0.009) continue;
    aging[agingBucket(asOf, d.date)] += d.amount;
  }
  for (const c of openCredits) {
    if (c.amount <= 0.009) continue;
    aging[agingBucket(asOf, c.date)] -= c.amount;
  }
  for (const key of Object.keys(aging) as AgingBucket[]) {
    aging[key] = round2(aging[key]);
  }
  return aging;
}

/** Cuotas con saldo para aplicar en recibos. */
export async function listOpenTenantBills(opts?: {
  tenantId?: string;
  contractId?: string;
}) {
  const session = await requireStaff();
  const rows = await prisma.tenantBill.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      contract: {
        organizationId: session.organizationId,
        ...(opts?.contractId ? { id: opts.contractId } : {}),
        ...(opts?.tenantId
          ? { parties: { some: { userId: opts.tenantId, role: "TENANT" } } }
          : {}),
      },
    },
    include: {
      contract: {
        select: { code: true, property: { select: { title: true } } },
      },
    },
    orderBy: [{ dueDate: "asc" }],
    take: 100,
  });

  return rows
    .map((bill) => {
      const total = toNumber(bill.totalAmount);
      const paid = toNumber(bill.paidAmount);
      const balance = round2(total - paid);
      const currency = bill.currency;
      return {
        id: bill.id,
        number: `${bill.periodMonth}/${bill.periodYear}`,
        currency,
        total,
        paid,
        balance,
        contractLabel: `${bill.contract.code} · ${bill.contract.property.title}`,
        label: `${bill.periodMonth}/${bill.periodYear} · saldo ${balance.toLocaleString("es-AR", {
          style: "currency",
          currency,
        })} · ${bill.contract.code}`,
      };
    })
    .filter((b) => b.balance > 0.009);
}

/** Facturas de proveedor con saldo para aplicar en OP. */
export async function listOpenSupplierInvoices(opts?: {
  supplierId?: string;
}) {
  const session = await requireStaff();
  const rows = await prisma.supplierInvoice.findMany({
    where: {
      paidAt: null,
      ...(opts?.supplierId ? { supplierId: opts.supplierId } : {}),
      workOrder: { organizationId: session.organizationId },
    },
    include: {
      supplier: { select: { name: true } },
      workOrder: {
        select: {
          property: { select: { title: true } },
          contract: { select: { code: true } },
        },
      },
    },
    orderBy: [{ invoiceDate: "asc" }],
    take: 100,
  });

  return rows
    .map((inv) => {
      const balance = toNumber(inv.amount);
      const currency = inv.currency;
      const code = inv.workOrder.contract?.code ?? inv.workOrder.property.title;
      return {
        id: inv.id,
        number: inv.invoiceNumber ?? inv.id.slice(-6),
        currency,
        balance,
        label: `${inv.invoiceNumber ?? "Factura"} · saldo ${balance.toLocaleString("es-AR", {
          style: "currency",
          currency,
        })} · ${code}`,
      };
    })
    .filter((i) => i.balance > 0.009);
}

/** Rendiciones con saldo para aplicar en OP. */
export async function listOpenOwnerSettlements(opts?: { ownerId?: string }) {
  const session = await requireStaff();
  const rows = await prisma.ownerSettlement.findMany({
    where: {
      organizationId: session.organizationId,
      status: { in: ["ISSUED"] },
      ...(opts?.ownerId ? { ownerId: opts.ownerId } : {}),
    },
    include: { owner: { select: { name: true } } },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    take: 100,
  });

  return rows
    .map((s) => {
      const balance = toNumber(s.netPayout);
      const currency = s.currency;
      return {
        id: s.id,
        number: s.code,
        currency,
        balance,
        label: `${s.code} · ${s.periodMonth}/${s.periodYear} · saldo ${balance.toLocaleString("es-AR", {
          style: "currency",
          currency,
        })}`,
      };
    })
    .filter((s) => s.balance > 0.009);
}

export async function getTenantAccountStatement(
  tenantId: string,
): Promise<AccountStatement | null> {
  const session = await requireStaff();
  const tenant = await prisma.user.findFirst({
    where: {
      id: tenantId,
      contractParties: {
        some: {
          role: "TENANT",
          contract: { organizationId: session.organizationId },
        },
      },
    },
    select: { id: true, name: true },
  });
  if (!tenant) return null;

  const [bills, receiptApps] = await Promise.all([
    prisma.tenantBill.findMany({
      where: {
        contract: {
          organizationId: session.organizationId,
          parties: { some: { userId: tenantId, role: "TENANT" } },
        },
      },
      include: {
        contract: {
          select: { code: true, property: { select: { title: true } } },
        },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.receiptBillApplication.findMany({
      where: {
        receipt: {
          organizationId: session.organizationId,
          status: "POSTED",
          tenantId,
        },
      },
      include: {
        receipt: { select: { id: true, number: true, issueDate: true, currency: true } },
        tenantBill: {
          select: {
            periodMonth: true,
            periodYear: true,
            contract: { select: { code: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const movements: AccountStatementMovement[] = [];
  const asOf = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  );
  let currency = "ARS";
  const agingDebits: AgingItem[] = [];
  const agingCredits: AgingItem[] = [];

  for (const bill of bills) {
    const total = toNumber(bill.totalAmount);
    currency = bill.currency;
    const due = parseDbDate(bill.dueDate);
    movements.push({
      id: `bill-${bill.id}`,
      date: isoDay(bill.dueDate),
      kind: "BILL",
      number: `${bill.periodMonth}/${bill.periodYear}`,
      description: `Cuota · ${bill.contract.code} · ${bill.contract.property.title}`,
      debit: total,
      credit: 0,
      currency: bill.currency,
      href: `/cobros/${bill.id}`,
    });
    if (total > 0.009) agingDebits.push({ amount: total, date: due });

    const paid = toNumber(bill.paidAmount);
    if (paid > 0.009) {
      movements.push({
        id: `bill-paid-${bill.id}`,
        date: isoDay(bill.dueDate),
        kind: "RECEIPT",
        number: "Pago",
        description: `Pagos aplicados cuota ${bill.periodMonth}/${bill.periodYear}`,
        debit: 0,
        credit: paid,
        currency: bill.currency,
        href: `/cobros/${bill.id}`,
      });
      agingCredits.push({ amount: paid, date: due });
    }
  }

  for (const app of receiptApps) {
    const amount = toNumber(app.amount);
    if (amount <= 0.009) continue;
    const issued = parseDbDate(app.receipt.issueDate);
    movements.push({
      id: `app-${app.id}`,
      date: isoDay(app.receipt.issueDate),
      kind: "RECEIPT",
      number: app.receipt.number,
      description: `Recibo · cuota ${app.tenantBill.periodMonth}/${app.tenantBill.periodYear}`,
      debit: 0,
      credit: amount,
      currency: app.receipt.currency,
      href: `/tesoreria/recibos/${app.receipt.id}`,
    });
    agingCredits.push({ amount, date: issued });
  }

  const balance = round2(
    movements.reduce((acc, m) => acc + m.debit - m.credit, 0),
  );
  movements.sort((a, b) => a.date.localeCompare(b.date));

  return {
    partyId: tenant.id,
    partyName: tenant.name,
    currency,
    balance,
    aging: buildAging(agingDebits, agingCredits, asOf),
    movements,
  };
}

export async function getSupplierAccountStatement(
  supplierId: string,
): Promise<AccountStatement | null> {
  const session = await requireStaff();
  const supplier = await prisma.user.findFirst({
    where: {
      id: supplierId,
      supplierInvoices: {
        some: { workOrder: { organizationId: session.organizationId } },
      },
    },
    select: { id: true, name: true },
  });
  if (!supplier) return null;

  const [invoices, invoiceApps] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where: {
        supplierId,
        workOrder: { organizationId: session.organizationId },
      },
      include: {
        workOrder: {
          select: {
            code: true,
            property: { select: { title: true } },
          },
        },
      },
      orderBy: { invoiceDate: "asc" },
    }),
    prisma.paymentOrderInvoiceApplication.findMany({
      where: {
        paymentOrder: {
          organizationId: session.organizationId,
          status: "POSTED",
          supplierId,
        },
      },
      include: {
        paymentOrder: {
          select: { id: true, number: true, issueDate: true, currency: true },
        },
        supplierInvoice: { select: { invoiceNumber: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const movements: AccountStatementMovement[] = [];
  const asOf = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  );
  let currency = "ARS";
  const agingDebits: AgingItem[] = [];
  const agingCredits: AgingItem[] = [];

  for (const inv of invoices) {
    const amount = toNumber(inv.amount);
    currency = inv.currency;
    const due = parseDbDate(inv.invoiceDate);
    movements.push({
      id: `inv-${inv.id}`,
      date: isoDay(inv.invoiceDate),
      kind: "INVOICE",
      number: inv.invoiceNumber ?? inv.id.slice(-6),
      description: `Factura · ${inv.workOrder.code} · ${inv.workOrder.property.title}`,
      debit: amount,
      credit: 0,
      currency: inv.currency,
      href: `/mantenimiento`,
    });
    if (!inv.paidAt && amount > 0.009) {
      agingDebits.push({ amount, date: due });
    }
  }

  for (const app of invoiceApps) {
    const amount = toNumber(app.amount);
    const issued = parseDbDate(app.paymentOrder.issueDate);
    movements.push({
      id: `inv-app-${app.id}`,
      date: isoDay(app.paymentOrder.issueDate),
      kind: "PAYMENT_ORDER",
      number: app.paymentOrder.number,
      description: `OP · ${app.supplierInvoice.invoiceNumber ?? "factura"}`,
      debit: 0,
      credit: amount,
      currency: app.paymentOrder.currency,
      href: `/tesoreria/ordenes-pago/${app.paymentOrder.id}`,
    });
    agingCredits.push({ amount, date: issued });
  }

  const balance = round2(
    movements.reduce((acc, m) => acc + m.debit - m.credit, 0),
  );
  movements.sort((a, b) => a.date.localeCompare(b.date));

  return {
    partyId: supplier.id,
    partyName: supplier.name,
    currency,
    balance,
    aging: buildAging(agingDebits, agingCredits, asOf),
    movements,
  };
}

export async function getOwnerAccountStatement(
  ownerId: string,
): Promise<AccountStatement | null> {
  const session = await requireStaff();
  const owner = await prisma.user.findFirst({
    where: {
      id: ownerId,
      settlements: {
        some: { organizationId: session.organizationId },
      },
    },
    select: { id: true, name: true },
  });
  if (!owner) return null;

  const [settlements, settlementApps] = await Promise.all([
    prisma.ownerSettlement.findMany({
      where: {
        organizationId: session.organizationId,
        ownerId,
        status: { in: ["ISSUED", "PAID"] },
      },
      orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
    }),
    prisma.paymentOrderSettlementApplication.findMany({
      where: {
        paymentOrder: {
          organizationId: session.organizationId,
          status: "POSTED",
        },
        ownerSettlement: { ownerId },
      },
      include: {
        paymentOrder: {
          select: { id: true, number: true, issueDate: true, currency: true },
        },
        ownerSettlement: { select: { code: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const movements: AccountStatementMovement[] = [];
  const asOf = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  );
  let currency = "ARS";
  const agingDebits: AgingItem[] = [];
  const agingCredits: AgingItem[] = [];

  for (const s of settlements) {
    const amount = toNumber(s.netPayout);
    currency = s.currency;
    const due = new Date(s.periodYear, s.periodMonth - 1, 1);
    movements.push({
      id: `set-${s.id}`,
      date: isoDay(due),
      kind: "SETTLEMENT",
      number: s.code,
      description: `Rendición ${s.periodMonth}/${s.periodYear}`,
      debit: amount,
      credit: 0,
      currency: s.currency,
      href: `/rendiciones`,
    });
    if (s.status === "ISSUED" && amount > 0.009) {
      agingDebits.push({ amount, date: due });
    }
  }

  for (const app of settlementApps) {
    const amount = toNumber(app.amount);
    const issued = parseDbDate(app.paymentOrder.issueDate);
    movements.push({
      id: `set-app-${app.id}`,
      date: isoDay(app.paymentOrder.issueDate),
      kind: "PAYMENT_ORDER",
      number: app.paymentOrder.number,
      description: `OP · ${app.ownerSettlement.code}`,
      debit: 0,
      credit: amount,
      currency: app.paymentOrder.currency,
      href: `/tesoreria/ordenes-pago/${app.paymentOrder.id}`,
    });
    agingCredits.push({ amount, date: issued });
  }

  const balance = round2(
    movements.reduce((acc, m) => acc + m.debit - m.credit, 0),
  );
  movements.sort((a, b) => a.date.localeCompare(b.date));

  return {
    partyId: owner.id,
    partyName: owner.name,
    currency,
    balance,
    aging: buildAging(agingDebits, agingCredits, asOf),
    movements,
  };
}

export async function listTenantAccountSummaries(): Promise<AccountPartySummary[]> {
  const session = await requireStaff();
  const tenants = await prisma.user.findMany({
    where: {
      contractParties: {
        some: {
          role: "TENANT",
          contract: { organizationId: session.organizationId },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const summaries: AccountPartySummary[] = [];
  for (const tenant of tenants) {
    const stmt = await getTenantAccountStatement(tenant.id);
    if (!stmt || Math.abs(stmt.balance) < 0.009) continue;
    summaries.push({
      id: tenant.id,
      name: tenant.name,
      balance: stmt.balance,
      currency: stmt.currency,
      aging: stmt.aging,
    });
  }
  return summaries;
}

export async function listSupplierAccountSummaries(): Promise<AccountPartySummary[]> {
  const session = await requireStaff();
  const suppliers = await prisma.user.findMany({
    where: {
      supplierInvoices: {
        some: {
          paidAt: null,
          workOrder: { organizationId: session.organizationId },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const summaries: AccountPartySummary[] = [];
  for (const supplier of suppliers) {
    const stmt = await getSupplierAccountStatement(supplier.id);
    if (!stmt || Math.abs(stmt.balance) < 0.009) continue;
    summaries.push({
      id: supplier.id,
      name: supplier.name,
      balance: stmt.balance,
      currency: stmt.currency,
      aging: stmt.aging,
    });
  }
  return summaries;
}

export async function listOwnerAccountSummaries(): Promise<AccountPartySummary[]> {
  const session = await requireStaff();
  const owners = await prisma.user.findMany({
    where: {
      settlements: {
        some: {
          organizationId: session.organizationId,
          status: "ISSUED",
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const summaries: AccountPartySummary[] = [];
  for (const owner of owners) {
    const stmt = await getOwnerAccountStatement(owner.id);
    if (!stmt || Math.abs(stmt.balance) < 0.009) continue;
    summaries.push({
      id: owner.id,
      name: owner.name,
      balance: stmt.balance,
      currency: stmt.currency,
      aging: stmt.aging,
    });
  }
  return summaries;
}

/** @deprecated alias */
export const listClientAccountSummaries = listTenantAccountSummaries;
/** @deprecated alias */
export const getClientAccountStatement = getTenantAccountStatement;
