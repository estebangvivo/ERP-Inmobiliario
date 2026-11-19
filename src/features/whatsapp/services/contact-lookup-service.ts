import type { OrganizationRole, PartyRole, PropertyStatus } from "@prisma/client";
import { phonesMatch } from "@/features/auth/lib/phone";
import { excludePlatformSuperadminFromUser } from "@/features/auth/lib/platform-admin";
import { prisma } from "@/lib/prisma";

export type WhatsAppContactContract = {
  code: string;
  status: string;
  propertyTitle: string;
  partyRole: PartyRole;
  startDate: Date;
  endDate: Date | null;
  initialRent: number;
  currency: string;
};

export type WhatsAppContactProperty = {
  title: string;
  status: PropertyStatus | string;
  address?: string | null;
  city?: string | null;
};

export type WhatsAppContactProfile = {
  userId: string;
  name: string;
  firstName: string;
  orgRole: OrganizationRole;
  /** Persona encontrada en la inmobiliaria por teléfono. */
  isKnownPerson: boolean;
  /** Tiene datos de cliente (inquilino / propietario / garante / contratos). */
  isClient: boolean;
  isTenant: boolean;
  isOwner: boolean;
  isGuarantor: boolean;
  contracts: WhatsAppContactContract[];
  ownedProperties: WhatsAppContactProperty[];
  rentedProperties: WhatsAppContactProperty[];
};

/** Nombre para saludar: en fichas "APELLIDO NOMBRES" usa el primer nombre de pila. */
export function greetingFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fullName;
  if (parts.length === 1) return parts[0]!;

  const surname = parts[0]!;
  // CAISUTTI INES NELLY → Ines (fichas importadas en mayúsculas)
  if (
    surname === surname.toUpperCase() &&
    surname.length >= 3 &&
    !/[a-záéíóúüñ]/.test(surname)
  ) {
    const given = parts[1]!;
    return given.charAt(0) + given.slice(1).toLowerCase();
  }

  return parts[0]!;
}

function rolePriority(role: OrganizationRole): number {
  switch (role) {
    case "OWNER":
      return 5;
    case "TENANT":
      return 4;
    case "GUARANTOR":
      return 3;
    case "AGENT":
      return 1;
    default:
      return 0;
  }
}

function nameSimilarityScore(
  userName: string,
  waContactName: string | null | undefined,
): number {
  if (!waContactName?.trim()) return 0;
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const u = norm(userName);
  const w = norm(waContactName.trim());
  if (!w) return 0;
  if (u.includes(w) || w.includes(u)) return 6;
  const uParts = u.split(/\s+/);
  const wParts = w.split(/\s+/);
  let hits = 0;
  for (const wp of wParts) {
    if (wp.length < 3) continue;
    if (uParts.some((up) => up === wp || up.includes(wp) || wp.includes(up))) {
      hits += 1;
    }
  }
  return hits * 3;
}

export async function lookupWhatsAppContact(
  organizationId: string,
  waContactPhone: string,
  waContactName?: string | null,
): Promise<WhatsAppContactProfile | null> {
  if (!waContactPhone?.trim()) return null;

  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      user: {
        isActive: true,
        phone: { not: null },
        ...excludePlatformSuperadminFromUser(),
      },
    },
    include: {
      user: {
        select: { id: true, name: true, phone: true },
      },
    },
  });

  type Scored = {
    member: (typeof members)[number];
    score: number;
  };

  // Solo teléfono principal: el 2 es referencia y no identifica al contacto de WhatsApp.
  const scored: Scored[] = [];
  for (const m of members) {
    if (!phonesMatch(m.user.phone, waContactPhone)) continue;
    const score =
      20 +
      rolePriority(m.role) +
      nameSimilarityScore(m.user.name, waContactName);
    scored.push({ member: m, score });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.member.user.name.localeCompare(b.member.user.name, "es");
  });

  const member = scored[0]!.member;

  const [parties, ownedProperties] = await Promise.all([
    prisma.contractParty.findMany({
      where: {
        userId: member.user.id,
        contract: {
          organizationId,
          status: { in: ["ACTIVE", "EXPIRED", "RENEWED", "TERMINATED"] },
        },
      },
      include: {
        contract: {
          select: {
            code: true,
            status: true,
            startDate: true,
            endDate: true,
            initialRent: true,
            currency: true,
            property: {
              select: { title: true, status: true, address: true, city: true },
            },
          },
        },
      },
      orderBy: { contract: { startDate: "desc" } },
      take: 15,
    }),
    prisma.property.findMany({
      where: {
        organizationId,
        ownerships: { some: { ownerId: member.user.id } },
      },
      select: {
        title: true,
        status: true,
        address: true,
        city: true,
      },
      orderBy: [{ status: "asc" }, { title: "asc" }],
      take: 20,
    }),
  ]);

  const rentedProperties = parties
    .filter((p) => p.role === "TENANT")
    .map((p) => ({
      title: p.contract.property.title,
      status: p.contract.property.status,
      address: p.contract.property.address,
      city: p.contract.property.city,
    }));

  const isTenant =
    member.role === "TENANT" || parties.some((p) => p.role === "TENANT");
  const isOwner =
    member.role === "OWNER" ||
    parties.some((p) => p.role === "OWNER") ||
    ownedProperties.length > 0;
  const isGuarantor =
    member.role === "GUARANTOR" ||
    parties.some((p) => p.role === "GUARANTOR");
  const isClient =
    isTenant ||
    isOwner ||
    isGuarantor ||
    parties.length > 0 ||
    ownedProperties.length > 0;

  return {
    userId: member.user.id,
    name: member.user.name,
    firstName: greetingFirstName(member.user.name),
    orgRole: member.role,
    isKnownPerson: true,
    isClient,
    isTenant,
    isOwner,
    isGuarantor,
    contracts: parties.map((p) => ({
      code: p.contract.code,
      status: p.contract.status,
      propertyTitle: p.contract.property.title,
      partyRole: p.role,
      startDate: p.contract.startDate,
      endDate: p.contract.endDate,
      initialRent: Number(p.contract.initialRent),
      currency: p.contract.currency,
    })),
    ownedProperties,
    rentedProperties,
  };
}

export async function getWhatsAppContactProfile(
  organizationId: string,
  userId: string,
  waContactPhone: string,
): Promise<WhatsAppContactProfile | null> {
  const profile = await lookupWhatsAppContact(organizationId, waContactPhone);
  if (!profile || profile.userId !== userId) return null;
  return profile;
}
