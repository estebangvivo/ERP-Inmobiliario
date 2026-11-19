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

function firstNameFrom(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || fullName;
}

function memberMatchesPhone(
  phone: string | null | undefined,
  phone2: string | null | undefined,
  waContactPhone: string,
): boolean {
  return (
    phonesMatch(phone, waContactPhone) || phonesMatch(phone2, waContactPhone)
  );
}

export async function lookupWhatsAppContact(
  organizationId: string,
  waContactPhone: string,
): Promise<WhatsAppContactProfile | null> {
  if (!waContactPhone?.trim()) return null;

  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      user: {
        isActive: true,
        OR: [{ phone: { not: null } }, { phone2: { not: null } }],
        ...excludePlatformSuperadminFromUser(),
      },
    },
    include: {
      user: {
        select: { id: true, name: true, phone: true, phone2: true },
      },
    },
  });

  const member = members.find((m) =>
    memberMatchesPhone(m.user.phone, m.user.phone2, waContactPhone),
  );
  if (!member) return null;

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
    firstName: firstNameFrom(member.user.name),
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
