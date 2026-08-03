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
  console.log("Seeding SimpleInmo multi-tenant demo...");

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
      phone: "+54 11 4000-0001",
      city: "Buenos Aires",
      province: "CABA",
      country: "AR",
      billingStatus: "EXEMPT",
      billingPlan: "UNLIMITED_ANNUAL",
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
      transferNotes: "Enviar comprobante por email tras la transferencia.",
    },
  });

  async function upsertUser(
    email: string,
    name: string,
    extra: Record<string, unknown> = {},
    hashOverride?: string,
  ) {
    return prisma.user.upsert({
      where: { email },
      update: {
        name,
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

  await upsertUser(
    superEmail,
    "Superadmin Plataforma",
    { phone: "+54 11 0000-0000" },
    superHash,
  );

  const admin = await upsertUser("admin@erp.local", "Admin Sistema", {
    phone: "+54 11 4000-0001",
  });
  const agent = await upsertUser("agente@erp.local", "Laura Gómez", {
    phone: "+54 11 4000-0002",
  });
  const owner1 = await upsertUser("propietario1@erp.local", "Carlos Ruiz", {
    documentType: "CUIT",
    documentNumber: "20-12345678-9",
    bankAlias: "carlos.ruiz.mp",
    bankCbu: "0170001540000001234567",
    bankName: "BBVA",
  });
  const owner2 = await upsertUser("propietario2@erp.local", "María Fernández", {
    documentType: "DNI",
    documentNumber: "28456789",
    bankAlias: "maria.fernandez",
    bankCbu: "0720000088000001234567",
    bankName: "Santander",
  });
  const tenant1 = await upsertUser("inquilino1@erp.local", "Juan Pérez", {
    documentType: "DNI",
    documentNumber: "35123456",
    phone: "+54 11 5555-1001",
  });
  const tenant2 = await upsertUser("inquilino2@erp.local", "Ana López", {
    documentType: "DNI",
    documentNumber: "36789123",
  });
  const supplier = await upsertUser("proveedor@erp.local", "Plomería del Sur", {
    phone: "+54 11 4444-2222",
  });
  const guarantor = await upsertUser("garante@erp.local", "Roberto Guarante", {
    documentType: "DNI",
    documentNumber: "20111222",
  });

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
    {
      userId: supplier.id,
      role: "SUPPLIER",
      modules: ["home", "mantenimiento"],
    },
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

  const complex = await prisma.complex.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "edificio-libertad",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: "Edificio Libertad",
      slug: "edificio-libertad",
      address: "Av. Libertad 1250",
      city: "Buenos Aires",
      province: "CABA",
      country: "AR",
      lat: -34.6037,
      lng: -58.3816,
      description: "Complejo residencial de 4 unidades en Palermo.",
    },
  });

  const unitSpecs = [
    { code: "1A", floor: "1", ownershipCoefficient: 0.25, rooms: 2, bathrooms: 1, areaM2: 55 },
    { code: "1B", floor: "1", ownershipCoefficient: 0.25, rooms: 2, bathrooms: 1, areaM2: 58 },
    { code: "2A", floor: "2", ownershipCoefficient: 0.25, rooms: 3, bathrooms: 2, areaM2: 72 },
    { code: "2B", floor: "2", ownershipCoefficient: 0.25, rooms: 3, bathrooms: 2, areaM2: 70 },
  ] as const;

  const units = [];
  for (const spec of unitSpecs) {
    const unit = await prisma.unit.upsert({
      where: { complexId_code: { complexId: complex.id, code: spec.code } },
      update: {},
      create: {
        complexId: complex.id,
        code: spec.code,
        floor: spec.floor,
        ownershipCoefficient: spec.ownershipCoefficient,
        rooms: spec.rooms,
        bathrooms: spec.bathrooms,
        areaM2: spec.areaM2,
      },
    });
    units.push(unit);
  }

  const house = await prisma.property.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "casa-recoleta-vente-alquiler",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      title: "Casa en Recoleta con patio",
      slug: "casa-recoleta-vente-alquiler",
      description:
        "Casa de estilo francés con patio interno, ideal para familia. Disponible para venta o alquiler.",
      propertyType: "HOUSE",
      operationType: "BOTH",
      status: "AVAILABLE",
      price: 450000,
      currency: "USD",
      address: "Junín 1450",
      city: "Buenos Aires",
      province: "CABA",
      rooms: 4,
      bathrooms: 3,
      areaM2: 180,
      amenities: ["patio", "garage", "laundry"],
      publishedAt: new Date(),
      images: {
        create: [
          {
            url: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200",
            alt: "Fachada casa Recoleta",
            sortOrder: 0,
            isCover: true,
          },
        ],
      },
      ownerships: {
        create: [{ ownerId: owner1.id, sharePct: 100, isPrimary: true }],
      },
    },
  });

  const apt1 = await prisma.property.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "depto-libertad-2a",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      title: "Departamento 2A — Edificio Libertad",
      slug: "depto-libertad-2a",
      description: "Amplio 3 ambientes luminoso con balcón al frente.",
      propertyType: "APARTMENT",
      operationType: "RENT",
      status: "RENTED",
      price: 650000,
      currency: "ARS",
      address: "Av. Libertad 1250, 2A",
      city: "Buenos Aires",
      province: "CABA",
      rooms: 3,
      bathrooms: 2,
      areaM2: 72,
      amenities: ["balcony", "elevator"],
      publishedAt: new Date(),
      unitId: units[2].id,
      images: {
        create: [
          {
            url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200",
            alt: "Living departamento 2A",
            sortOrder: 0,
            isCover: true,
          },
        ],
      },
      ownerships: {
        create: [{ ownerId: owner2.id, sharePct: 100, isPrimary: true }],
      },
    },
  });

  await prisma.property.upsert({
    where: {
      organizationId_slug: {
        organizationId: org.id,
        slug: "depto-libertad-1a",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      title: "Departamento 1A — Edificio Libertad",
      slug: "depto-libertad-1a",
      description: "2 ambientes reciclado, cocina integrada.",
      propertyType: "APARTMENT",
      operationType: "RENT",
      status: "AVAILABLE",
      price: 480000,
      currency: "ARS",
      address: "Av. Libertad 1250, 1A",
      city: "Buenos Aires",
      province: "CABA",
      rooms: 2,
      bathrooms: 1,
      areaM2: 55,
      amenities: ["elevator"],
      publishedAt: new Date(),
      unitId: units[0].id,
      ownerships: {
        create: [{ ownerId: owner1.id, sharePct: 100, isPrimary: true }],
      },
    },
  });

  const contract = await prisma.contract.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: "CTR-2026-001",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      code: "CTR-2026-001",
      propertyId: apt1.id,
      status: "ACTIVE",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-12-31"),
      initialRent: 650000,
      currency: "ARS",
      depositAmount: 1300000,
      agencyCommissionPct: 5,
      commissionMode: "PERCENT_RENT",
      commissionValue: 5,
      commissionTenantPct: 0,
      commissionOwnerPct: 100,
      lateFeeDailyRatePct: 0.05,
      includesOrdinaryExp: true,
      includesExtraordExp: false,
      parties: {
        create: [
          { userId: owner2.id, role: "OWNER", sharePct: 100 },
          { userId: tenant1.id, role: "TENANT", sharePct: 100 },
          { userId: guarantor.id, role: "GUARANTOR" },
        ],
      },
      adjustments: {
        create: [
          {
            indexType: "ICL",
            periodMonths: 6,
            effectiveFrom: new Date("2026-07-01"),
            notes: "Ajuste semestral ICL",
          },
        ],
      },
    },
  });

  await prisma.tenantBill.upsert({
    where: {
      contractId_periodYear_periodMonth: {
        contractId: contract.id,
        periodYear: 2026,
        periodMonth: 8,
      },
    },
    update: {},
    create: {
      contractId: contract.id,
      periodYear: 2026,
      periodMonth: 8,
      dueDate: new Date("2026-08-10"),
      rentAmount: 650000,
      expensesAmount: 45000,
      lateFeeAmount: 0,
      otherAmount: 0,
      totalAmount: 695000,
      paidAmount: 0,
      currency: "ARS",
      status: "PENDING",
    },
  });

  await prisma.expense.upsert({
    where: {
      complexId_type_concept_periodYear_periodMonth: {
        complexId: complex.id,
        type: "ORDINARY",
        concept: "Expensas ordinarias agosto",
        periodYear: 2026,
        periodMonth: 8,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      complexId: complex.id,
      type: "ORDINARY",
      concept: "Expensas ordinarias agosto",
      periodYear: 2026,
      periodMonth: 8,
      totalAmount: 180000,
      currency: "ARS",
      allocationMethod: "OWNERSHIP_COEFFICIENT",
      billToTenant: true,
      allocations: {
        create: units.map((u) => ({
          unitId: u.id,
          amount: 45000,
        })),
      },
    },
  });

  const existingLeads = await prisma.lead.count({
    where: { organizationId: org.id },
  });
  if (existingLeads === 0) {
    await prisma.lead.createMany({
      data: [
        {
          organizationId: org.id,
          propertyId: house.id,
          name: "Sofía Martínez",
          email: "sofia@example.com",
          phone: "+54 11 6000-1111",
          message: "Quisiera agendar una visita para el fin de semana.",
          status: "NEW",
          assigneeId: agent.id,
          source: "storefront",
        },
        {
          organizationId: org.id,
          propertyId: apt1.id,
          name: "Diego Torres",
          email: "diego@example.com",
          message: "¿El alquiler incluye expensas?",
          status: "NEW",
          assigneeId: agent.id,
          source: "storefront",
        },
      ],
    });
  }

  console.log("Seed complete.");
  console.log("Org:", org.slug);
  console.log("Demo login: admin@erp.local / demo1234");
  console.log(
    "Superadmin:",
    superEmail,
    "/",
    process.env.PLATFORM_SUPERADMIN_PASSWORD?.trim() || "SebaEmma0210$",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
