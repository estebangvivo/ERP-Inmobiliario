import type { OrganizationSession } from "@/lib/auth";
import {
  ADJUSTMENT_INDEX_LABELS,
  CONTRACT_STATUS_LABELS,
  PARTY_ROLE_LABELS,
  ROLE_LABELS,
  SALE_DEAL_STAGE_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from "@/lib/labels";
import { isStaffRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { contractScopeWhere, propertyScopeWhere } from "@/lib/tenant-scope";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import type {
  BillStatus,
  ContractStatus,
  Currency,
  OperationType,
  PartyRole,
  PropertyStatus,
  PropertyType,
  SaleDealStage,
  SettlementStatus,
  WorkOrderStatus,
} from "@prisma/client";

export type HistoryEvent = {
  at: Date;
  title: string;
  detail: string;
  href?: string;
};

export type HistoryParty = {
  userId: string;
  name: string;
  role: PartyRole;
};

export type HistoryContractRow = {
  id: string;
  code: string;
  status: ContractStatus;
  startDate: Date;
  endDate: Date;
  currency: Currency;
  initialRent: string;
  currentRent: string;
  propertyId: string;
  propertyTitle: string;
  parties: HistoryParty[];
  billsPending: number;
  billsPaid: number;
};

export type HistoryRentPriceRow = {
  at: Date;
  contractId: string;
  contractCode: string;
  label: string;
  amount: string;
  currency: Currency;
};

export type HistorySaleRow = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  buyerName: string;
  stage: SaleDealStage;
  offerAmount: string | null;
  reservationAmount: string | null;
  commissionAmount: string | null;
  currency: Currency;
  deedDate: Date | null;
  reservedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
};

export type HistoryOwnerRow = {
  userId: string;
  name: string;
  sharePct: string;
  isPrimary: boolean;
  since: Date;
};

export type HistoryWorkOrderRow = {
  id: string;
  code: string;
  title: string;
  status: WorkOrderStatus;
  requestedAt: Date;
  completedAt: Date | null;
};

export type PropertyHistory = {
  property: {
    id: string;
    title: string;
    slug: string;
    address: string;
    city: string;
    province: string | null;
    propertyType: PropertyType;
    operationType: OperationType;
    status: PropertyStatus;
    price: string;
    rentPrice: string | null;
    currency: Currency;
    rentCurrency: Currency | null;
    createdAt: Date;
    publishedAt: Date | null;
    complexName: string | null;
    unitCode: string | null;
  };
  events: HistoryEvent[];
  contracts: HistoryContractRow[];
  rentPrices: HistoryRentPriceRow[];
  saleDeals: HistorySaleRow[];
  owners: HistoryOwnerRow[];
  workOrders: HistoryWorkOrderRow[];
};

export type PersonHistory = {
  person: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    documentType: string | null;
    documentNumber: string | null;
    role: string | null;
    isActive: boolean;
    createdAt: Date;
  };
  properties: {
    id: string;
    title: string;
    address: string;
    city: string;
    status: PropertyStatus;
    sharePct: string;
    isPrimary: boolean;
    since: Date;
  }[];
  contracts: HistoryContractRow[];
  rentPrices: HistoryRentPriceRow[];
  saleDeals: HistorySaleRow[];
  settlements: {
    id: string;
    code: string;
    periodYear: number;
    periodMonth: number;
    netPayout: string;
    currency: Currency;
    status: SettlementStatus;
    issuedAt: Date | null;
  }[];
  events: HistoryEvent[];
};

function currentRentFrom(
  initialRent: { toString(): string },
  adjustments: { appliedRent: { toString(): string } | null; effectiveFrom: Date }[],
): string {
  const applied = [...adjustments]
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())
    .find((a) => a.appliedRent != null);
  return applied?.appliedRent?.toString() ?? initialRent.toString();
}

function mapContract(c: {
  id: string;
  code: string;
  status: ContractStatus;
  startDate: Date;
  endDate: Date;
  currency: Currency;
  initialRent: { toString(): string };
  propertyId: string;
  property: { title: string };
  parties: { userId: string; role: PartyRole; user: { name: string } }[];
  adjustments: { appliedRent: { toString(): string } | null; effectiveFrom: Date }[];
  tenantBills: { status: BillStatus }[];
}): HistoryContractRow {
  const billsPaid = c.tenantBills.filter((b) => b.status === "PAID").length;
  const billsPending = c.tenantBills.filter(
    (b) => b.status === "PENDING" || b.status === "PARTIAL" || b.status === "OVERDUE",
  ).length;
  return {
    id: c.id,
    code: c.code,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    currency: c.currency,
    initialRent: c.initialRent.toString(),
    currentRent: currentRentFrom(c.initialRent, c.adjustments),
    propertyId: c.propertyId,
    propertyTitle: c.property.title,
    parties: c.parties.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      role: p.role,
    })),
    billsPending,
    billsPaid,
  };
}

function rentPriceRowsFrom(c: {
  id: string;
  code: string;
  startDate: Date;
  currency: Currency;
  initialRent: { toString(): string };
  adjustments: {
    appliedRent: { toString(): string } | null;
    effectiveFrom: Date;
    indexType: keyof typeof ADJUSTMENT_INDEX_LABELS;
    customPercent: { toString(): string } | null;
    notes: string | null;
  }[];
}): HistoryRentPriceRow[] {
  const rows: HistoryRentPriceRow[] = [
    {
      at: c.startDate,
      contractId: c.id,
      contractCode: c.code,
      label: "Alquiler inicial",
      amount: c.initialRent.toString(),
      currency: c.currency,
    },
  ];
  for (const a of c.adjustments) {
    if (a.appliedRent == null) continue;
    const pct = a.customPercent ? ` ${a.customPercent.toString()}%` : "";
    rows.push({
      at: a.effectiveFrom,
      contractId: c.id,
      contractCode: c.code,
      label: `Ajuste ${ADJUSTMENT_INDEX_LABELS[a.indexType]}${pct}`,
      amount: a.appliedRent.toString(),
      currency: c.currency,
    });
  }
  return rows;
}

function mapSale(d: {
  id: string;
  propertyId: string;
  property: { title: string };
  buyerName: string;
  stage: SaleDealStage;
  offerAmount: { toString(): string } | null;
  reservationAmount: { toString(): string } | null;
  commissionAmount: { toString(): string } | null;
  currency: Currency;
  deedDate: Date | null;
  reservedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
}): HistorySaleRow {
  return {
    id: d.id,
    propertyId: d.propertyId,
    propertyTitle: d.property.title,
    buyerName: d.buyerName,
    stage: d.stage,
    offerAmount: d.offerAmount?.toString() ?? null,
    reservationAmount: d.reservationAmount?.toString() ?? null,
    commissionAmount: d.commissionAmount?.toString() ?? null,
    currency: d.currency,
    deedDate: d.deedDate,
    reservedAt: d.reservedAt,
    closedAt: d.closedAt,
    createdAt: d.createdAt,
  };
}

function sortEvents(events: HistoryEvent[]): HistoryEvent[] {
  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

const contractInclude = {
  property: { select: { title: true } },
  parties: { include: { user: { select: { id: true, name: true } } } },
  adjustments: { orderBy: { effectiveFrom: "asc" as const } },
  tenantBills: { select: { status: true } },
};

export async function getPropertyHistory(
  session: OrganizationSession,
  propertyId: string,
): Promise<PropertyHistory | null> {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, AND: [propertyScopeWhere(session)] },
    include: {
      unit: { include: { complex: { select: { name: true } } } },
      ownerships: {
        include: { owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      contracts: {
        include: contractInclude,
        orderBy: { startDate: "desc" },
      },
      saleDeals: { orderBy: { createdAt: "desc" } },
      workOrders: {
        orderBy: { requestedAt: "desc" },
        take: 30,
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          requestedAt: true,
          completedAt: true,
        },
      },
    },
  });
  if (!property) return null;

  const contracts = property.contracts.map(mapContract);
  const rentPrices = property.contracts
    .flatMap(rentPriceRowsFrom)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const saleDeals = property.saleDeals.map((d) =>
    mapSale({ ...d, property: { title: property.title } }),
  );

  const events: HistoryEvent[] = [
    {
      at: property.createdAt,
      title: "Alta de la propiedad",
      detail: `${property.title} · ${property.address}, ${property.city}`,
    },
  ];
  if (property.publishedAt) {
    events.push({
      at: property.publishedAt,
      title: "Publicada en el portal",
      detail: "Quedó visible en el sitio público.",
    });
  }
  for (const o of property.ownerships) {
    events.push({
      at: o.createdAt,
      title: "Titular registrado",
      detail: `${o.owner.name} · ${Number(o.sharePct)}%`,
      href: `/personas/${o.ownerId}`,
    });
  }
  for (const c of property.contracts) {
    events.push({
      at: c.createdAt,
      title: `Contrato ${c.code}`,
      detail: `${CONTRACT_STATUS_LABELS[c.status]} · ${c.parties
        .filter((p) => p.role === "TENANT")
        .map((p) => p.user.name)
        .join(", ") || "sin inquilino"}`,
      href: `/contratos/${c.id}`,
    });
    events.push({
      at: c.startDate,
      title: `Inicio ${c.code}`,
      detail: `Alquiler inicial ${c.initialRent.toString()} ${c.currency}`,
      href: `/contratos/${c.id}`,
    });
    if (c.status === "EXPIRED" || c.status === "TERMINATED") {
      events.push({
        at: c.endDate,
        title: `${CONTRACT_STATUS_LABELS[c.status]} · ${c.code}`,
        detail: c.status === "TERMINATED" ? "Rescisión" : "Fin de vigencia",
        href: `/contratos/${c.id}`,
      });
    }
    for (const a of c.adjustments) {
      if (a.appliedRent == null) continue;
      events.push({
        at: a.effectiveFrom,
        title: `Ajuste de alquiler · ${c.code}`,
        detail: `${ADJUSTMENT_INDEX_LABELS[a.indexType]} · ${a.appliedRent.toString()} ${c.currency}`,
        href: `/contratos/${c.id}`,
      });
    }
  }
  for (const d of property.saleDeals) {
    events.push({
      at: d.createdAt,
      title: `Oportunidad de venta · ${SALE_DEAL_STAGE_LABELS[d.stage]}`,
      detail: d.buyerName,
      href: `/ventas/${d.id}`,
    });
    if (d.reservedAt) {
      events.push({
        at: d.reservedAt,
        title: "Seña / reserva",
        detail: d.reservationAmount
          ? `${d.reservationAmount.toString()} ${d.currency} · ${d.buyerName}`
          : d.buyerName,
        href: `/ventas/${d.id}`,
      });
    }
    if (d.deedDate) {
      events.push({
        at: d.deedDate,
        title: "Boleto de compraventa",
        detail: d.buyerName,
        href: `/ventas/${d.id}`,
      });
    }
    if (d.closedAt) {
      events.push({
        at: d.closedAt,
        title: d.stage === "SOLD" ? "Venta cerrada" : "Operación cerrada",
        detail: d.offerAmount
          ? `${d.offerAmount.toString()} ${d.currency}`
          : d.buyerName,
        href: `/ventas/${d.id}`,
      });
    }
  }
  for (const w of property.workOrders) {
    events.push({
      at: w.requestedAt,
      title: `Reclamo ${w.code}`,
      detail: `${w.title} · ${WORK_ORDER_STATUS_LABELS[w.status]}`,
      href: `/mantenimiento/${w.id}`,
    });
  }

  return {
    property: {
      id: property.id,
      title: property.title,
      slug: property.slug,
      address: property.address,
      city: property.city,
      province: property.province,
      propertyType: property.propertyType,
      operationType: property.operationType,
      status: property.status,
      price: property.price.toString(),
      rentPrice: property.rentPrice?.toString() ?? null,
      currency: property.currency,
      rentCurrency: property.rentCurrency,
      createdAt: property.createdAt,
      publishedAt: property.publishedAt,
      complexName: property.unit?.complex.name ?? null,
      unitCode: property.unit?.code ?? null,
    },
    events: sortEvents(events),
    contracts,
    rentPrices,
    saleDeals,
    owners: property.ownerships.map((o) => ({
      userId: o.ownerId,
      name: o.owner.name,
      sharePct: o.sharePct.toString(),
      isPrimary: o.isPrimary,
      since: o.createdAt,
    })),
    workOrders: property.workOrders,
  };
}

export async function canViewPersonHistory(
  session: OrganizationSession,
  userId: string,
): Promise<boolean> {
  if (session.user.id === userId) return true;

  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId: session.organizationId,
      userId,
      user: excludePlatformSuperadminFromUser(),
    },
    select: { id: true },
  });
  if (!member) return false;
  if (isStaffRole(session.organizationRole)) return true;

  if (session.organizationRole === "OWNER") {
    const hit = await prisma.contractParty.findFirst({
      where: {
        userId,
        role: { in: ["TENANT", "GUARANTOR"] },
        contract: {
          organizationId: session.organizationId,
          OR: [
            { parties: { some: { userId: session.user.id, role: "OWNER" } } },
            {
              property: {
                ownerships: { some: { ownerId: session.user.id } },
              },
            },
          ],
        },
      },
      select: { id: true },
    });
    return !!hit;
  }

  if (session.organizationRole === "TENANT") {
    const hit = await prisma.contractParty.findFirst({
      where: {
        userId,
        role: { in: ["OWNER", "GUARANTOR"] },
        contract: {
          organizationId: session.organizationId,
          parties: { some: { userId: session.user.id, role: "TENANT" } },
        },
      },
      select: { id: true },
    });
    return !!hit;
  }

  return false;
}

export async function getPersonHistory(
  session: OrganizationSession,
  userId: string,
): Promise<PersonHistory | null> {
  if (!(await canViewPersonHistory(session, userId))) return null;

  const person = await prisma.user.findFirst({
    where: {
      id: userId,
      ...excludePlatformSuperadminFromUser(),
      memberships: { some: { organizationId: session.organizationId } },
    },
    include: {
      memberships: {
        where: { organizationId: session.organizationId },
        take: 1,
      },
    },
  });
  if (!person) return null;

  const staff = isStaffRole(session.organizationRole);
  const contractWhere = staff
    ? {
        organizationId: session.organizationId,
        parties: { some: { userId } },
      }
    : {
        parties: { some: { userId } },
        AND: [contractScopeWhere(session)],
      };

  const [ownerships, contracts, settlements, saleDeals] = await Promise.all([
    prisma.propertyOwnership.findMany({
      where: {
        ownerId: userId,
        property: propertyScopeWhere(session),
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contract.findMany({
      where: contractWhere,
      include: contractInclude,
      orderBy: { startDate: "desc" },
    }),
    staff || session.user.id === userId
      ? prisma.ownerSettlement.findMany({
          where: {
            organizationId: session.organizationId,
            ownerId: userId,
          },
          orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
          take: 24,
          select: {
            id: true,
            code: true,
            periodYear: true,
            periodMonth: true,
            netPayout: true,
            currency: true,
            status: true,
            issuedAt: true,
          },
        })
      : Promise.resolve([]),
    staff && person.email
      ? prisma.saleDeal.findMany({
          where: {
            organizationId: session.organizationId,
            buyerEmail: { equals: person.email, mode: "insensitive" },
          },
          include: { property: { select: { title: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const contractRows = contracts.map(mapContract);
  const rentPrices = contracts
    .filter((c) => c.parties.some((p) => p.userId === userId && p.role === "TENANT"))
    .flatMap(rentPriceRowsFrom)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const roleLabel = person.memberships[0]?.role
    ? ROLE_LABELS[person.memberships[0].role]
    : null;
  const events: HistoryEvent[] = [
    {
      at: person.createdAt,
      title: "Alta en la inmobiliaria",
      detail: roleLabel ? `Rol: ${roleLabel}` : "Usuario dado de alta",
    },
  ];
  for (const o of ownerships) {
    events.push({
      at: o.createdAt,
      title: "Propiedad a su nombre",
      detail: `${o.property.title} · ${Number(o.sharePct)}%`,
      href: `/gestion/propiedades/${o.propertyId}/historial`,
    });
  }
  for (const c of contracts) {
    const role = c.parties.find((p) => p.userId === userId)?.role;
    events.push({
      at: c.startDate,
      title: `Contrato ${c.code}`,
      detail: `${c.property.title}${role ? ` · ${PARTY_ROLE_LABELS[role]}` : ""}`,
      href: `/contratos/${c.id}`,
    });
  }

  return {
    person: {
      id: person.id,
      name: person.name,
      email: person.email,
      phone: person.phone,
      documentType: person.documentType,
      documentNumber: person.documentNumber,
      role: person.memberships[0]?.role ?? null,
      isActive: person.isActive,
      createdAt: person.createdAt,
    },
    properties: ownerships.map((o) => ({
      id: o.property.id,
      title: o.property.title,
      address: o.property.address,
      city: o.property.city,
      status: o.property.status,
      sharePct: o.sharePct.toString(),
      isPrimary: o.isPrimary,
      since: o.createdAt,
    })),
    contracts: contractRows,
    rentPrices,
    saleDeals: saleDeals.map(mapSale),
    settlements: settlements.map((s) => ({
      id: s.id,
      code: s.code,
      periodYear: s.periodYear,
      periodMonth: s.periodMonth,
      netPayout: s.netPayout.toString(),
      currency: s.currency,
      status: s.status,
      issuedAt: s.issuedAt,
    })),
    events: sortEvents(events),
  };
}
