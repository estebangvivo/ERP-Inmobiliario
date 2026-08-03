/**
 * Backfill multi-tenant fields on existing demo rows, then seed memberships.
 * Safe: does not wipe tables; creates demo-inmobiliaria and assigns null organizationIds.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

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
  "usuarios",
  "ajustes",
];

async function main() {
  console.log("Backfill multi-tenant...");

  const passwordHash = await hash("demo1234", 10);
  const superHash = await hash(
    process.env.PLATFORM_SUPERADMIN_PASSWORD?.trim() || "SebaEmma0210$",
    10,
  );

  const org = await prisma.organization.upsert({
    where: { slug: "demo-inmobiliaria" },
    update: {
      name: "Demo Inmobiliaria",
      billingStatus: "EXEMPT",
      billingPlan: "UNLIMITED_ANNUAL",
    },
    create: {
      name: "Demo Inmobiliaria",
      slug: "demo-inmobiliaria",
      email: "admin@erp.local",
      billingStatus: "EXEMPT",
      billingPlan: "UNLIMITED_ANNUAL",
      country: "AR",
    },
  });

  await prisma.platformBillingSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      mpSurchargePercent: 4,
      planPrices: {
        TRIAL: { priceUsd: 0, priceArs: 0, days: 30, maxUsers: 1 },
        SOLO_MONTHLY: { priceUsd: 59, days: 30, maxUsers: 1 },
        SOLO_ANNUAL: { priceUsd: 599, days: 365, maxUsers: 1 },
        TEAM_MONTHLY: { priceUsd: 99, days: 30, maxUsers: 5 },
        TEAM_ANNUAL: { priceUsd: 999, days: 365, maxUsers: 5 },
        UNLIMITED_MONTHLY: { priceUsd: 119, days: 30, maxUsers: null },
        UNLIMITED_ANNUAL: { priceUsd: 1199, days: 365, maxUsers: null },
      },
      transferAccountName: "SimpleInmo SA",
      transferTaxId: "30-00000000-0",
      transferBankNameArs: "Galicia",
      transferCbuArs: "0070000000000000000001",
      transferAliasArs: "erp.inmobiliario",
    },
  });

  // Backfill organizationId on domain rows
  await prisma.complex.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  await prisma.property.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  await prisma.contract.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  await prisma.expense.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  await prisma.workOrder.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  await prisma.ownerSettlement.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  await prisma.lead.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });

  // Ensure authId on users
  const users = await prisma.user.findMany();
  for (const u of users) {
    if (!u.authId) {
      await prisma.user.update({
        where: { id: u.id },
        data: {
          authId: `local:${u.email}`,
          passwordHash: u.passwordHash ?? passwordHash,
        },
      });
    }
  }

  async function ensureUser(
    email: string,
    name: string,
    extra: Record<string, unknown> = {},
    hashOverride?: string,
  ) {
    return prisma.user.upsert({
      where: { email },
      update: {
        name,
        authId: `local:${email}`,
        passwordHash: hashOverride ?? passwordHash,
        isActive: true,
        ...extra,
      },
      create: {
        authId: `local:${email}`,
        email,
        name,
        passwordHash: hashOverride ?? passwordHash,
        isActive: true,
        ...extra,
      },
    });
  }

  const superEmail =
    process.env.PLATFORM_SUPERADMIN_EMAILS?.split(",")[0]?.trim().toLowerCase() ||
    "adminesteban@bunas.com.ar";

  await ensureUser(superEmail, "Superadmin Plataforma", {}, superHash);
  const admin = await ensureUser("admin@erp.local", "Admin Sistema");
  const agent = await ensureUser("agente@erp.local", "Laura Gómez");
  const owner1 = await ensureUser("propietario1@erp.local", "Carlos Ruiz");
  const owner2 = await ensureUser("propietario2@erp.local", "María Fernández");
  const tenant1 = await ensureUser("inquilino1@erp.local", "Juan Pérez");
  const tenant2 = await ensureUser("inquilino2@erp.local", "Ana López");
  const supplier = await ensureUser("proveedor@erp.local", "Plomería del Sur");
  const guarantor = await ensureUser("garante@erp.local", "Roberto Guarante");

  const memberships: Array<{
    userId: string;
    role: "ADMIN" | "AGENT" | "OWNER" | "TENANT" | "SUPPLIER" | "VIEWER";
    modules: string[];
  }> = [
    { userId: admin.id, role: "ADMIN", modules: ALL_MODULES },
    {
      userId: agent.id,
      role: "AGENT",
      modules: [
        "home",
        "propiedades",
        "complejos",
        "contratos",
        "cobros",
        "expensas",
        "mantenimiento",
        "rendiciones",
        "consultas",
      ],
    },
    {
      userId: owner1.id,
      role: "OWNER",
      modules: ["home", "propiedades", "contratos", "expensas", "mantenimiento", "rendiciones"],
    },
    {
      userId: owner2.id,
      role: "OWNER",
      modules: ["home", "propiedades", "contratos", "expensas", "mantenimiento", "rendiciones"],
    },
    {
      userId: tenant1.id,
      role: "TENANT",
      modules: ["home", "contratos", "cobros", "mantenimiento"],
    },
    {
      userId: tenant2.id,
      role: "TENANT",
      modules: ["home", "contratos", "cobros", "mantenimiento"],
    },
    { userId: supplier.id, role: "SUPPLIER", modules: ["home", "mantenimiento"] },
    { userId: guarantor.id, role: "VIEWER", modules: ["home", "contratos"] },
  ];

  for (const m of memberships) {
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: m.userId,
        },
      },
      update: { role: m.role, allowedModules: m.modules },
      create: {
        organizationId: org.id,
        userId: m.userId,
        role: m.role,
        allowedModules: m.modules,
      },
    });
  }

  console.log("Backfill complete. Org:", org.slug, org.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
