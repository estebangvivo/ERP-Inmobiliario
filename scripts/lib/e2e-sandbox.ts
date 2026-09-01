import type { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import {
  ensureCashRegisters,
  nextCashSessionNumber,
} from "../../src/features/treasury/lib/cash-helpers";
import { alignContractPropertyOwners } from "./align-contract-owners";
import { ensureOrganization } from "./ensure-organization";
import { wipeOrgOperational } from "./wipe-org-data";

export const E2E_ORG_SLUG = "demo-e2e";
export const E2E_ORG_NAME = "Demo E2E";
export const E2E_CONTRACT_CODE = "E2E-CTR-001";
export const E2E_BANK_NAME = "E2E Caja ARS";
export const E2E_BILL_RENT = 650_000;
export const E2E_BILL_EXPENSES = 45_000;
export const E2E_BILL_TOTAL = E2E_BILL_RENT + E2E_BILL_EXPENSES;

const ADMIN_EMAIL = "admin@erp.local";
const OWNER_EMAIL = "e2e-owner@erp.local";
const TENANT_EMAIL = "e2e-tenant@erp.local";
const PASSWORD = "demo1234";

const ALL_MODULES = [
  "home",
  "propiedades",
  "complejos",
  "contratos",
  "cobros",
  "expensas",
  "mantenimiento",
  "rendiciones",
  "consultas",
  "tesoreria",
  "usuarios",
  "ajustes",
];

export type E2ESandboxFixtures = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  contractCode: string;
  billId: string;
  billPeriodYear: number;
  billPeriodMonth: number;
  billTotalAmount: number;
  ownerName: string;
  ownerId: string;
  ownerEmail: string;
  tenantName: string;
  tenantEmail: string;
  settlementPeriodYear: number;
  settlementPeriodMonth: number;
  bankAccountId: string;
  dailyCashBalanceBefore: number;
  complexId: string;
  complexName: string;
  propertyId: string;
  propertyTitle: string;
  availablePropertyId: string;
  availablePropertyTitle: string;
};

async function upsertUser(
  prisma: PrismaClient,
  email: string,
  name: string,
  passwordHash: string,
) {
  const existing = await prisma.user.findFirst({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { name, passwordHash, isActive: true },
    });
  }
  return prisma.user.create({
    data: {
      authId: `local:${email}`,
      email,
      name,
      passwordHash,
      isActive: true,
    },
  });
}

async function ensureMember(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  role: "ADMIN" | "OWNER" | "TENANT" | "AGENT",
  modules: string[],
) {
  const existing = await prisma.organizationMember.findFirst({
    where: { organizationId, userId },
    select: { id: true },
  });
  if (existing) {
    await prisma.organizationMember.update({
      where: { id: existing.id },
      data: { role, allowedModules: modules },
    });
    return;
  }
  await prisma.organizationMember.create({
    data: { organizationId, userId, role, allowedModules: modules },
  });
}

export async function resetE2ESandbox(prisma: PrismaClient): Promise<E2ESandboxFixtures> {
  const passwordHash = await hash(PASSWORD, 10);
  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;

  const org = await ensureOrganization(prisma, {
    slug: E2E_ORG_SLUG,
    name: E2E_ORG_NAME,
    email: "e2e@erp.local",
    city: "Buenos Aires",
    province: "CABA",
    country: "AR",
    billingStatus: "EXEMPT",
    billingPlan: "UNLIMITED_ANNUAL",
  });

  await wipeOrgOperational(prisma, org.id);

  const admin = await upsertUser(prisma, ADMIN_EMAIL, "Admin Sistema", passwordHash);
  const owner = await upsertUser(
    prisma,
    OWNER_EMAIL,
    "E2E Propietario",
    passwordHash,
  );
  const tenant = await upsertUser(
    prisma,
    TENANT_EMAIL,
    "E2E Inquilino",
    passwordHash,
  );

  await ensureMember(prisma, org.id, admin.id, "ADMIN", ALL_MODULES);
  await ensureMember(prisma, org.id, owner.id, "OWNER", [
    "home",
    "propiedades",
    "contratos",
    "expensas",
    "rendiciones",
  ]);
  await ensureMember(
    prisma,
    org.id,
    tenant.id,
    "TENANT",
    ["home", "contratos", "cobros"],
  );

  const complex = await prisma.complex.create({
    data: {
      organizationId: org.id,
      name: "Edificio E2E",
      slug: "edificio-e2e",
      address: "Calle E2E 100",
      city: "Buenos Aires",
      province: "CABA",
      country: "AR",
    },
  });

  const unit = await prisma.unit.create({
    data: {
      complexId: complex.id,
      code: "1A",
      floor: "1",
      ownershipCoefficient: 1,
      rooms: 2,
      bathrooms: 1,
      areaM2: 55,
    },
  });

  const property = await prisma.property.create({
    data: {
      organizationId: org.id,
      title: "Depto E2E 1A",
      slug: "depto-e2e-1a",
      propertyType: "APARTMENT",
      operationType: "RENT",
      status: "RENTED",
      price: E2E_BILL_RENT,
      currency: "ARS",
      address: "Calle E2E 100, 1A",
      city: "Buenos Aires",
      province: "CABA",
      unitId: unit.id,
      ownerships: {
        create: [{ ownerId: owner.id, sharePct: 100, isPrimary: true }],
      },
    },
  });

  const availableProperty = await prisma.property.create({
    data: {
      organizationId: org.id,
      title: "Depto E2E disponible",
      slug: "depto-e2e-disponible",
      propertyType: "APARTMENT",
      operationType: "RENT",
      status: "AVAILABLE",
      price: E2E_BILL_RENT,
      currency: "ARS",
      address: "Calle E2E 200",
      city: "Buenos Aires",
      province: "CABA",
      ownerships: {
        create: [{ ownerId: owner.id, sharePct: 100, isPrimary: true }],
      },
    },
  });

  const contract = await prisma.contract.create({
    data: {
      organizationId: org.id,
      code: E2E_CONTRACT_CODE,
      propertyId: property.id,
      status: "ACTIVE",
      startDate: new Date(periodYear, 0, 1),
      endDate: new Date(periodYear + 1, 11, 31),
      initialRent: E2E_BILL_RENT,
      currency: "ARS",
      depositAmount: E2E_BILL_RENT * 2,
      agencyCommissionPct: 5,
      commissionMode: "PERCENT_RENT",
      commissionValue: 5,
      commissionOwnerPct: 100,
      includesOrdinaryExp: true,
      parties: {
        create: [
          { userId: owner.id, role: "OWNER", sharePct: 100 },
          { userId: tenant.id, role: "TENANT", sharePct: 100 },
        ],
      },
    },
  });

  await alignContractPropertyOwners(prisma, org.id);

  const bill = await prisma.tenantBill.create({
    data: {
      contractId: contract.id,
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

  let bank = await prisma.bankAccount.findFirst({
    where: { organizationId: org.id, name: E2E_BANK_NAME },
  });
  if (!bank) {
    bank = await prisma.bankAccount.create({
      data: {
        organizationId: org.id,
        name: E2E_BANK_NAME,
        bankName: "Banco E2E",
        currency: "ARS",
        isActive: true,
      },
    });
  }

  const { daily } = await ensureCashRegisters(org.id, "ARS");
  await prisma.cashRegister.update({
    where: { id: daily.id },
    data: { balance: 0 },
  });

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
        businessDate: now,
        status: "OPEN",
        currency: "ARS",
        openingBalance: 0,
        openedById: admin.id,
      },
    });
  }

  const dailyCashBalanceBefore = 0;

  return {
    orgId: org.id,
    orgSlug: E2E_ORG_SLUG,
    orgName: E2E_ORG_NAME,
    contractCode: E2E_CONTRACT_CODE,
    billId: bill.id,
    billPeriodYear: periodYear,
    billPeriodMonth: periodMonth,
    billTotalAmount: E2E_BILL_TOTAL,
    ownerName: owner.name,
    ownerId: owner.id,
    ownerEmail: OWNER_EMAIL,
    tenantName: tenant.name,
    tenantEmail: TENANT_EMAIL,
    settlementPeriodYear: periodYear,
    settlementPeriodMonth: periodMonth,
    bankAccountId: bank.id,
    dailyCashBalanceBefore,
    complexId: complex.id,
    complexName: complex.name,
    propertyId: property.id,
    propertyTitle: property.title,
    availablePropertyId: availableProperty.id,
    availablePropertyTitle: availableProperty.title,
  };
}
