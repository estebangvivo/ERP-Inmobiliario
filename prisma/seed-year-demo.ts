/**
 * Simula ~12 meses de operación en Demo Inmobiliaria.
 *
 *   npx tsx prisma/seed-year-demo.ts
 *   railway run npx tsx prisma/seed-year-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const ORG_SLUG = "demo-inmobiliaria";
const PASSWORD = "demo1234";
const END = new Date(Date.UTC(2026, 7, 1)); // ago 2026
const START = new Date(Date.UTC(2025, 7, 1)); // ago 2025

const OWNER_MODULES = [
  "home",
  "propiedades",
  "contratos",
  "expensas",
  "mantenimiento",
  "rendiciones",
];
const TENANT_MODULES = ["home", "contratos", "cobros", "mantenimiento"];
const SUPPLIER_MODULES = ["home", "mantenimiento"];

const COVER_IMAGES = [
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
];

const CITIES = [
  { city: "Buenos Aires", province: "CABA" },
  { city: "Vicente López", province: "Buenos Aires" },
  { city: "San Isidro", province: "Buenos Aires" },
  { city: "Córdoba", province: "Córdoba" },
  { city: "Rosario", province: "Santa Fe" },
] as const;

function monthsBetween(from: Date, to: Date) {
  const out: Array<{ year: number; month: number }> = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor <= end) {
    out.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function dateUTC(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function money(n: number) {
  return Math.round(n);
}

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length]!;
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function wipeOrgOperationalData(organizationId: string) {
  console.log("Limpiando datos operativos...");

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
  const settlements = await prisma.ownerSettlement.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const settlementIds = settlements.map((s) => s.id);
  const workOrders = await prisma.workOrder.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const workOrderIds = workOrders.map((w) => w.id);
  const properties = await prisma.property.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const propertyIds = properties.map((p) => p.id);
  const complexes = await prisma.complex.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const complexIds = complexes.map((c) => c.id);

  if (billIds.length) {
    await prisma.payment.deleteMany({ where: { tenantBillId: { in: billIds } } });
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
  }
  await prisma.contract.deleteMany({ where: { organizationId } });

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

  if (workOrderIds.length) {
    await prisma.supplierInvoice.deleteMany({
      where: { workOrderId: { in: workOrderIds } },
    });
  }
  await prisma.workOrder.deleteMany({ where: { organizationId } });
  await prisma.lead.deleteMany({ where: { organizationId } });

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

  const yearUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: "prop.yr." } },
        { email: { startsWith: "inq.yr." } },
        { email: { startsWith: "prov.yr." } },
      ],
    },
    select: { id: true },
  });
  if (yearUsers.length) {
    const ids = yearUsers.map((u) => u.id);
    await prisma.organizationMember.deleteMany({
      where: { organizationId, userId: { in: ids } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

async function upsertUser(
  email: string,
  name: string,
  passwordHash: string,
  extra: Record<string, unknown> = {},
) {
  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, isActive: true, ...extra },
    create: {
      authId: `local:${email}`,
      email,
      name,
      passwordHash,
      isActive: true,
      ...extra,
    },
  });
}

async function ensureMembership(
  organizationId: string,
  userId: string,
  role: "OWNER" | "TENANT" | "SUPPLIER" | "ADMIN" | "AGENT",
  modules: string[],
) {
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: { role, allowedModules: modules },
    create: { organizationId, userId, role, allowedModules: modules },
  });
}

async function main() {
  console.log("=== Seed año Demo Inmobiliaria ===");
  console.log(
    `Período: ${START.toISOString().slice(0, 10)} → ${END.toISOString().slice(0, 10)}`,
  );

  const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (!org) {
    throw new Error(
      `No existe "${ORG_SLUG}". Corré primero: npx tsx prisma/seed.ts`,
    );
  }
  const organizationId = org.id;

  const passwordHash = await hash(PASSWORD, 10);
  await wipeOrgOperationalData(organizationId);

  const admin = await upsertUser("admin@erp.local", "Admin Sistema", passwordHash, {
    phone: "+54 11 4000-0001",
  });
  const agent = await upsertUser("agente@erp.local", "Laura Gómez", passwordHash, {
    phone: "+54 11 4000-0002",
  });
  await ensureMembership(org.id, admin.id, "ADMIN", [
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
  ]);
  await ensureMembership(org.id, agent.id, "AGENT", [
    "home",
    "propiedades",
    "complejos",
    "contratos",
    "cobros",
    "expensas",
    "mantenimiento",
    "rendiciones",
    "consultas",
  ]);

  console.log("Usuarios (propietarios / inquilinos / proveedores)...");
  const ownerNames = [
    "Carlos Ruiz",
    "María Fernández",
    "Pedro Álvarez",
    "Lucía Romero",
    "Martín Soto",
    "Valentina Paz",
    "Diego Navarro",
    "Camila Borges",
  ];
  const owners = [];
  for (let i = 0; i < ownerNames.length; i++) {
    const user = await upsertUser(
      `prop.yr.${i + 1}@erp.local`,
      ownerNames[i]!,
      passwordHash,
      {
        documentType: i % 2 === 0 ? "CUIT" : "DNI",
        documentNumber: `${20000000 + i * 111}`,
        phone: `+54 11 5100-${1000 + i}`,
        bankAlias: `prop.yr.${i + 1}`,
        bankCbu: `017000154000000${1234560 + i}`,
        bankName: pick(["BBVA", "Galicia", "Santander", "Macro"], i),
      },
    );
    await ensureMembership(org.id, user.id, "OWNER", OWNER_MODULES);
    owners.push(user);
  }

  const tenantNames = [
    "Juan Pérez",
    "Ana López",
    "Sofía Martínez",
    "Diego Torres",
    "Florencia Díaz",
    "Nicolás Vega",
    "Paula Herrera",
    "Tomás Acosta",
    "Julieta Ríos",
    "Facundo Molina",
    "Agustina Silva",
    "Matías Castro",
    "Carolina Méndez",
    "Sebastián Ortiz",
    "Laura Domínguez",
  ];
  const tenants: Array<{ id: string; email: string; name: string }> = [];
  for (let i = 0; i < tenantNames.length; i++) {
    const user = await upsertUser(
      `inq.yr.${i + 1}@erp.local`,
      tenantNames[i]!,
      passwordHash,
      {
        documentType: "DNI",
        documentNumber: `${35000000 + i * 137}`,
        phone: `+54 11 5200-${2000 + i}`,
      },
    );
    await ensureMembership(org.id, user.id, "TENANT", TENANT_MODULES);
    tenants.push(user);
  }

  const suppliers = [];
  for (const [i, name] of [
    "Plomería del Sur",
    "Electricidad Norte",
    "Pinturería Express",
  ].entries()) {
    const user = await upsertUser(
      `prov.yr.${i + 1}@erp.local`,
      name,
      passwordHash,
      { phone: `+54 11 5300-${3000 + i}` },
    );
    await ensureMembership(org.id, user.id, "SUPPLIER", SUPPLIER_MODULES);
    suppliers.push(user);
  }

  console.log("Complejos y unidades...");
  const complexDefs = [
    {
      name: "Edificio Libertad",
      slug: "edificio-libertad",
      address: "Av. Libertad 1250",
      city: "Buenos Aires",
      province: "CABA",
      units: 8,
    },
    {
      name: "Torre Palermo Green",
      slug: "torre-palermo-green",
      address: "Honduras 4800",
      city: "Buenos Aires",
      province: "CABA",
      units: 6,
    },
    {
      name: "Complejo Norte Residencial",
      slug: "complejo-norte",
      address: "Av. Maipú 2200",
      city: "Vicente López",
      province: "Buenos Aires",
      units: 4,
    },
  ] as const;

  type UnitRow = {
    id: string;
    code: string;
    complexId: string;
    address: string;
    city: string;
    province: string;
  };
  const allUnits: UnitRow[] = [];
  const complexRows: Array<{ id: string; unitIds: string[]; units: UnitRow[] }> =
    [];

  for (const def of complexDefs) {
    const complex = await prisma.complex.create({
      data: {
        organizationId,
        name: def.name,
        slug: def.slug,
        address: def.address,
        city: def.city,
        province: def.province,
        country: "AR",
        description: `${def.name}: ${def.units} unidades residenciales.`,
      },
    });
    const units: UnitRow[] = [];
    const coeff = Number((1 / def.units).toFixed(6));
    for (let i = 0; i < def.units; i++) {
      const floor = String(Math.floor(i / 2) + 1);
      const code = `${floor}${i % 2 === 0 ? "A" : "B"}`;
      const unit = await prisma.unit.create({
        data: {
          complexId: complex.id,
          code,
          floor,
          ownershipCoefficient: coeff,
          rooms: 2 + (i % 3),
          bathrooms: 1 + (i % 2),
          areaM2: 45 + i * 8,
        },
      });
      const row: UnitRow = {
        id: unit.id,
        code,
        complexId: complex.id,
        address: def.address,
        city: def.city,
        province: def.province,
      };
      units.push(row);
      allUnits.push(row);
    }
    complexRows.push({
      id: complex.id,
      unitIds: units.map((u) => u.id),
      units,
    });
  }

  console.log("Propiedades...");
  type PropRow = {
    id: string;
    ownerId: string;
    unitId: string | null;
    title: string;
    rent: number;
    status: "AVAILABLE" | "RENTED" | "RESERVED" | "SOLD" | "DRAFT";
    currency: "ARS" | "USD";
  };
  const properties: PropRow[] = [];

  for (let i = 0; i < allUnits.length; i++) {
    const unit = allUnits[i]!;
    const owner = pick(owners, i);
    const rent = money(380000 + i * 22000);
    const status: PropRow["status"] =
      i % 7 === 0 ? "AVAILABLE" : i % 11 === 0 ? "RESERVED" : "RENTED";
    const title = `Departamento ${unit.code}`;
    const slug = slugify(`depto-${unit.complexId.slice(-5)}-${unit.code}-${i}`);
    const created = await prisma.property.create({
      data: {
        organizationId,
        title: `${title} · ${unit.address}`,
        slug,
        description: `${title} en ${unit.address}. Ambientes luminosos, amenities y seguridad.`,
        propertyType: "APARTMENT",
        operationType: "RENT",
        status,
        price: rent,
        currency: "ARS",
        address: `${unit.address}, ${unit.code}`,
        city: unit.city,
        province: unit.province,
        rooms: 2 + (i % 3),
        bathrooms: 1 + (i % 2),
        areaM2: 45 + i * 5,
        amenities: ["elevator", "balcony", "security"].slice(0, 1 + (i % 3)),
        publishedAt: dateUTC(2025, 8, 1 + (i % 25)),
        unitId: unit.id,
        images: {
          create: [
            {
              url: pick(COVER_IMAGES, i),
              alt: title,
              sortOrder: 0,
              isCover: true,
            },
          ],
        },
        ownerships: {
          create: [{ ownerId: owner.id, sharePct: 100, isPrimary: true }],
        },
      },
    });
    properties.push({
      id: created.id,
      ownerId: owner.id,
      unitId: unit.id,
      title: created.title,
      rent,
      status,
      currency: "ARS",
    });
  }

  const extras: Array<{
    title: string;
    type: "HOUSE" | "OFFICE" | "COMMERCIAL" | "LAND" | "APARTMENT";
    op: "RENT" | "SALE" | "BOTH";
    status: PropRow["status"];
    price: number;
    currency: "ARS" | "USD";
    rooms?: number;
  }> = [
    {
      title: "Casa en Recoleta con patio",
      type: "HOUSE",
      op: "BOTH",
      status: "AVAILABLE",
      price: 450000,
      currency: "USD",
      rooms: 4,
    },
    {
      title: "Casa familiar en San Isidro",
      type: "HOUSE",
      op: "RENT",
      status: "RENTED",
      price: 1200000,
      currency: "ARS",
      rooms: 5,
    },
    {
      title: "PH en Palermo Hollywood",
      type: "HOUSE",
      op: "RENT",
      status: "RENTED",
      price: 890000,
      currency: "ARS",
      rooms: 3,
    },
    {
      title: "Oficina en Microcentro",
      type: "OFFICE",
      op: "RENT",
      status: "RENTED",
      price: 720000,
      currency: "ARS",
      rooms: 2,
    },
    {
      title: "Local comercial Av. Santa Fe",
      type: "COMMERCIAL",
      op: "RENT",
      status: "RENTED",
      price: 1500000,
      currency: "ARS",
      rooms: 1,
    },
    {
      title: "Casa en venta Belgrano R",
      type: "HOUSE",
      op: "SALE",
      status: "AVAILABLE",
      price: 380000,
      currency: "USD",
      rooms: 4,
    },
    {
      title: "Terreno en Córdoba capital",
      type: "LAND",
      op: "SALE",
      status: "AVAILABLE",
      price: 95000,
      currency: "USD",
    },
    {
      title: "Duplex Vicente López (ex contrato)",
      type: "HOUSE",
      op: "RENT",
      status: "AVAILABLE",
      price: 980000,
      currency: "ARS",
      rooms: 4,
    },
    {
      title: "Depto vendido Rosario",
      type: "APARTMENT",
      op: "SALE",
      status: "SOLD",
      price: 210000,
      currency: "USD",
      rooms: 3,
    },
    {
      title: "Casa Núñez lista para alquilar",
      type: "HOUSE",
      op: "RENT",
      status: "AVAILABLE",
      price: 1050000,
      currency: "ARS",
      rooms: 4,
    },
    {
      title: "Monoambiente Palermo Soho",
      type: "APARTMENT",
      op: "RENT",
      status: "RENTED",
      price: 420000,
      currency: "ARS",
      rooms: 1,
    },
    {
      title: "Casa en draft (no publicada)",
      type: "HOUSE",
      op: "RENT",
      status: "DRAFT",
      price: 700000,
      currency: "ARS",
      rooms: 3,
    },
  ];

  for (let i = 0; i < extras.length; i++) {
    const e = extras[i]!;
    const owner = pick(owners, i + 3);
    const loc = pick(CITIES, i);
    const slug = slugify(`extra-${e.title}-${i}`);
    const created = await prisma.property.create({
      data: {
        organizationId,
        title: e.title,
        slug,
        description: `${e.title}. Generada para simulación anual SimpleInmo.`,
        propertyType: e.type,
        operationType: e.op,
        status: e.status,
        price: e.price,
        currency: e.currency,
        address: `${100 + i * 17} Calle Demo`,
        city: loc.city,
        province: loc.province,
        rooms: e.rooms ?? null,
        bathrooms: e.rooms ? Math.max(1, Math.floor(e.rooms / 2)) : null,
        areaM2: e.type === "LAND" ? 450 : 60 + i * 15,
        amenities: e.type === "LAND" ? [] : ["garage", "patio"],
        publishedAt:
          e.status === "DRAFT" ? null : dateUTC(2025, 9, 1 + (i % 20)),
        images: {
          create: [
            {
              url: pick(COVER_IMAGES, i + 2),
              alt: e.title,
              sortOrder: 0,
              isCover: true,
            },
          ],
        },
        ownerships: {
          create: [{ ownerId: owner.id, sharePct: 100, isPrimary: true }],
        },
      },
    });
    properties.push({
      id: created.id,
      ownerId: owner.id,
      unitId: null,
      title: created.title,
      rent: e.currency === "ARS" ? e.price : money(e.price * 1200),
      status: e.status,
      currency: e.currency,
    });
  }

  console.log("Contratos, cuotas y pagos...");
  const months = monthsBetween(START, END);

  // Contratos activos (sobre RENTED)
  const activeProps = properties.filter((p) => p.status === "RENTED");
  const endedProps = properties.filter(
    (p) =>
      p.title.includes("ex contrato") ||
      p.title.includes("Núñez") ||
      (p.status === "AVAILABLE" && p.unitId && properties.indexOf(p) % 9 === 0),
  );

  type ContractRow = {
    id: string;
    ownerId: string;
    tenantId: string;
    rent: number;
    currency: "ARS" | "USD";
    status: "ACTIVE" | "TERMINATED";
    propertyTitle: string;
  };
  const contractRows: ContractRow[] = [];
  let contractSeq = 1;

  async function createContract(opts: {
    property: PropRow;
    tenantIndex: number;
    status: "ACTIVE" | "TERMINATED";
    start: Date;
    end: Date;
  }) {
    const code = `YR-${opts.start.getUTCFullYear()}-${String(contractSeq++).padStart(3, "0")}`;
    const tenant = pick(tenants, opts.tenantIndex);
    const rentArs =
      opts.property.currency === "USD"
        ? money(
            Number(opts.property.rent) > 10000
              ? opts.property.rent
              : opts.property.rent * 1100,
          )
        : opts.property.rent;

    const contract = await prisma.contract.create({
      data: {
        organizationId,
        code,
        propertyId: opts.property.id,
        status: opts.status,
        startDate: opts.start,
        endDate: opts.end,
        initialRent: rentArs,
        currency: "ARS",
        depositAmount: money(rentArs * 2),
        agencyCommissionPct: 5,
        commissionMode: "PERCENT_RENT",
        commissionValue: 5,
        commissionTenantPct: 0,
        commissionOwnerPct: 100,
        lateFeeDailyRatePct: 1.2,
        includesOrdinaryExp: true,
        includesExtraordExp: false,
        notes: `Contrato simulado ${opts.status}`,
        parties: {
          create: [
            { userId: opts.property.ownerId, role: "OWNER", sharePct: 100 },
            { userId: tenant.id, role: "TENANT", sharePct: 100 },
          ],
        },
        adjustments: {
          create: [
            {
              indexType: "ICL",
              periodMonths: 6,
              effectiveFrom: dateUTC(
                opts.start.getUTCFullYear(),
                opts.start.getUTCMonth() + 7,
                1,
              ),
              notes: "Ajuste semestral ICL",
            },
          ],
        },
      },
    });

    contractRows.push({
      id: contract.id,
      ownerId: opts.property.ownerId,
      tenantId: tenant.id,
      rent: rentArs,
      currency: "ARS",
      status: opts.status,
      propertyTitle: opts.property.title,
    });
    return contract;
  }

  for (let i = 0; i < activeProps.length; i++) {
    const prop = activeProps[i]!;
    const startMonthOffset = i % 4;
    const start = dateUTC(
      START.getUTCFullYear(),
      START.getUTCMonth() + 1 + startMonthOffset,
      1,
    );
    await createContract({
      property: prop,
      tenantIndex: i,
      status: "ACTIVE",
      start,
      end: dateUTC(2027, 7, 31),
    });
  }

  for (let i = 0; i < Math.min(5, endedProps.length || properties.length); i++) {
    const prop =
      endedProps[i] ??
      properties.find((p) => p.status === "AVAILABLE" && !p.unitId) ??
      properties[i]!;
    await createContract({
      property: prop,
      tenantIndex: i + 8,
      status: "TERMINATED",
      start: dateUTC(2024, 8, 1),
      end: dateUTC(2025, 10 + (i % 3), 28),
    });
    if (prop.status === "RENTED") {
      await prisma.property.update({
        where: { id: prop.id },
        data: { status: "AVAILABLE" },
      });
    }
  }

  // 2 borradores
  for (let i = 0; i < 2; i++) {
    const prop = properties.find((p) => p.status === "AVAILABLE") ?? properties[0]!;
    const tenant = pick(tenants, i + 12);
    await prisma.contract.create({
      data: {
        organizationId,
        code: `YR-DRAFT-${i + 1}`,
        propertyId: prop.id,
        status: "DRAFT",
        startDate: dateUTC(2026, 9, 1),
        endDate: dateUTC(2028, 8, 31),
        initialRent: prop.rent,
        currency: "ARS",
        depositAmount: money(prop.rent * 2),
        parties: {
          create: [
            { userId: prop.ownerId, role: "OWNER", sharePct: 100 },
            { userId: tenant.id, role: "TENANT", sharePct: 100 },
          ],
        },
      },
    });
  }

  let billsCreated = 0;
  let paymentsCreated = 0;

  for (const contract of contractRows) {
    for (const { year, month } of months) {
      const periodDate = dateUTC(year, month, 1);
      // Solo generar cuotas dentro de la vigencia aproximada
      if (contract.status === "TERMINATED" && year === 2026 && month > 2) continue;

      const expensesAmount = money(35000 + (month % 5) * 4000);
      const rentAmount = money(
        contract.rent * (month >= 2 && month <= 7 && year === 2026 ? 1.08 : 1),
      );
      const late = month % 6 === 0 ? money(rentAmount * 0.02) : 0;
      const total = money(rentAmount + expensesAmount + late);

      // Patrón de cobro: mayoría pagadas, algunas parciales/vencidas/pendientes
      const pattern = (year + month + contract.rent) % 10;
      let status: "PAID" | "PARTIAL" | "OVERDUE" | "PENDING" = "PAID";
      let paidAmount = total;
      if (year === 2026 && month >= 7) {
        if (pattern < 3) {
          status = "PENDING";
          paidAmount = 0;
        } else if (pattern < 5) {
          status = "OVERDUE";
          paidAmount = 0;
        } else if (pattern < 6) {
          status = "PARTIAL";
          paidAmount = money(total * 0.5);
        }
      } else if (pattern === 0) {
        status = "PARTIAL";
        paidAmount = money(total * 0.6);
      }

      const bill = await prisma.tenantBill.create({
        data: {
          contractId: contract.id,
          periodYear: year,
          periodMonth: month,
          dueDate: dateUTC(year, month, 10),
          rentAmount,
          expensesAmount,
          lateFeeAmount: late,
          otherAmount: 0,
          totalAmount: total,
          paidAmount,
          commissionAmount: money(rentAmount * 0.05),
          currency: "ARS",
          status,
          issuedAt: periodDate,
          notes: `Liquidación ${month}/${year}`,
        },
      });
      billsCreated += 1;

      if (paidAmount > 0) {
        await prisma.payment.create({
          data: {
            tenantBillId: bill.id,
            amount: paidAmount,
            currency: "ARS",
            method: pick(
              ["BANK_TRANSFER", "CASH", "CHECK", "GATEWAY", "CARD"] as const,
              month + year,
            ),
            paidAt: dateUTC(year, month, 5 + (pattern % 8)),
            reference: `TRX-${year}${String(month).padStart(2, "0")}-${bill.id.slice(-4)}`,
            recordedById: admin.id,
            notes: status === "PARTIAL" ? "Pago parcial" : "Pago mes completo",
          },
        });
        paymentsCreated += 1;
      }
    }
  }

  console.log("Expensas de complejos...");
  let expensesCreated = 0;
  for (const complex of complexRows) {
    for (const { year, month } of months) {
      const totalAmount = money(120000 + complex.units.length * 18000 + month * 2500);
      const perUnit = money(totalAmount / complex.units.length);
      await prisma.expense.create({
        data: {
          organizationId,
          complexId: complex.id,
          type: month % 4 === 0 ? "EXTRAORDINARY" : "ORDINARY",
          concept:
            month % 4 === 0
              ? `Expensa extraordinaria ${month}/${year}`
              : `Expensas ordinarias ${month}/${year}`,
          periodYear: year,
          periodMonth: month,
          totalAmount,
          currency: "ARS",
          allocationMethod: "OWNERSHIP_COEFFICIENT",
          billToTenant: true,
          allocations: {
            create: complex.units.map((u) => ({
              unitId: u.id,
              amount: perUnit,
            })),
          },
        },
      });
      expensesCreated += 1;
    }
  }

  console.log("Rendiciones a propietarios...");
  let settlementsCreated = 0;
  const ownerIds = [...new Set(contractRows.map((c) => c.ownerId))];
  for (const ownerId of ownerIds) {
    for (const { year, month } of months) {
      if (year === 2026 && month > 7) continue;
      const ownerContracts = contractRows.filter((c) => c.ownerId === ownerId);
      const grossRent = money(
        ownerContracts.reduce((acc, c) => acc + c.rent, 0) *
          (ownerContracts.length ? 1 : 0),
      );
      if (grossRent <= 0) continue;
      const commissionAmount = money(grossRent * 0.05);
      const deductionsAmount = money(15000 + (month % 3) * 5000);
      const netPayout = money(grossRent - commissionAmount - deductionsAmount);
      const status =
        year === 2026 && month >= 7
          ? "ISSUED"
          : month % 5 === 0
            ? "ISSUED"
            : "PAID";

      const settlement = await prisma.ownerSettlement.create({
        data: {
          organizationId,
          code: `RND-${year}${String(month).padStart(2, "0")}-${ownerId.slice(-4)}`,
          ownerId,
          periodYear: year,
          periodMonth: month,
          currency: "ARS",
          grossRent,
          commissionAmount,
          deductionsAmount,
          extraordinaryAmount: 0,
          netPayout,
          status,
          issuedAt: dateUTC(year, month, 12),
          paidAt: status === "PAID" ? dateUTC(year, month, 15) : null,
          transferRef: status === "PAID" ? `TRF-${year}${month}-${ownerId.slice(-3)}` : null,
          lines: {
            create: [
              {
                concept: "Alquileres cobrados",
                amount: grossRent,
              },
              {
                concept: "Comisión agencia 5%",
                amount: -commissionAmount,
              },
              {
                concept: "Deducciones / expensas",
                amount: -deductionsAmount,
              },
            ],
          },
        },
      });
      settlementsCreated += 1;
    }
  }

  console.log("Mantenimientos y facturas de proveedores...");
  let workOrdersCreated = 0;
  const woTitles = [
    "Pérdida de agua en cocina",
    "Falla de portero eléctrico",
    "Pintura de living",
    "Cambio de cerradura",
    "Revisión instalación eléctrica",
    "Humedad en baño",
    "Arreglo de persianas",
    "Mantenimiento caldera",
  ];
  for (let i = 0; i < 28; i++) {
    const prop = pick(properties, i);
    const contract = contractRows.find((c) =>
      properties.some((p) => p.id === prop.id && p.ownerId === c.ownerId),
    );
    const monthOffset = i % months.length;
    const m = months[monthOffset]!;
    const status = pick(
      ["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const,
      i,
    );
    const assignee = pick(suppliers, i);
    const wo = await prisma.workOrder.create({
      data: {
        organizationId,
        code: `OT-YR-${String(i + 1).padStart(3, "0")}`,
        propertyId: prop.id,
        contractId: contract?.id ?? null,
        title: pick(woTitles, i),
        description: `Orden generada en simulación ${m.month}/${m.year}.`,
        status,
        costBearer: i % 3 === 0 ? "TENANT" : "OWNER_DEDUCTIBLE",
        assigneeId: status === "OPEN" ? null : assignee.id,
        requestedAt: dateUTC(m.year, m.month, 3 + (i % 20)),
        completedAt:
          status === "COMPLETED" ? dateUTC(m.year, m.month, 20) : null,
      },
    });
    workOrdersCreated += 1;

    if (status === "COMPLETED" || status === "IN_PROGRESS") {
      await prisma.supplierInvoice.create({
        data: {
          workOrderId: wo.id,
          supplierId: assignee.id,
          invoiceNumber: `FAC-${2025 + (i % 2)}-${1000 + i}`,
          amount: money(25000 + i * 3500),
          currency: "ARS",
          invoiceDate: dateUTC(m.year, m.month, 18),
          costBearer: i % 3 === 0 ? "TENANT" : "OWNER_DEDUCTIBLE",
          paidAt: status === "COMPLETED" ? dateUTC(m.year, m.month, 25) : null,
          notes: "Factura simulación anual",
        },
      });
    }
  }

  console.log("Consultas / leads...");
  const leadNames = [
    "Martina Quiroga",
    "Bruno Salas",
    "Elena Freitas",
    "Iván Correa",
    "Nadia Benítez",
    "Gonzalo Paredes",
    "Helena Suárez",
    "Ramiro Blanco",
    "Patricia Núñez",
    "Esteban Gallo",
    "Melina Duarte",
    "Joaquín Vera",
  ];
  for (let i = 0; i < leadNames.length; i++) {
    const prop = pick(
      properties.filter((p) => p.status === "AVAILABLE" || p.status === "RESERVED"),
      i,
    );
    const m = pick(months, i);
    await prisma.lead.create({
      data: {
        organizationId,
        propertyId: prop?.id ?? null,
        name: leadNames[i]!,
        email: `lead.yr.${i + 1}@example.com`,
        phone: `+54 11 6000-${1100 + i}`,
        message: pick(
          [
            "Quiero agendar una visita el fin de semana.",
            "¿El precio es negociable?",
            "¿Incluye expensas?",
            "Me interesa para mudanza en 30 días.",
            "¿Aceptan mascotas?",
          ],
          i,
        ),
        status: pick(
          ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED"] as const,
          i,
        ),
        assigneeId: agent.id,
        source: "storefront",
        createdAt: dateUTC(m.year, m.month, 2 + (i % 25)),
      },
    });
  }

  console.log("=== Listo ===");
  console.log({
    org: org.slug,
    owners: owners.length,
    tenants: tenants.length,
    suppliers: suppliers.length,
    complexes: complexRows.length,
    units: allUnits.length,
    properties: properties.length,
    contractsActive: contractRows.filter((c) => c.status === "ACTIVE").length,
    contractsEnded: contractRows.filter((c) => c.status === "TERMINATED")
      .length,
    bills: billsCreated,
    payments: paymentsCreated,
    expenses: expensesCreated,
    settlements: settlementsCreated,
    workOrders: workOrdersCreated,
  });
  console.log(`Login admin: admin@erp.local / ${PASSWORD}`);
  console.log("Propietario ej: prop.yr.1@erp.local / demo1234");
  console.log("Inquilino ej: inq.yr.1@erp.local / demo1234");

  const { alignContractPropertyOwners } = await import(
    "../scripts/lib/align-contract-owners"
  );
  const aligned = await alignContractPropertyOwners(prisma, org.id);
  if (aligned > 0) {
    console.log(`Contratos alineados (owner ↔ propiedad): ${aligned}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
