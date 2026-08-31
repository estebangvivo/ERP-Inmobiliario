import type { OrganizationRole, PartyRole } from "@prisma/client";
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
  status: string;
};

export type WhatsAppContactProfile = {
  userId: string;
  name: string;
  firstName: string;
  orgRole: OrganizationRole;
  isClient: boolean;
  isTenant: boolean;
  isOwner: boolean;
  contracts: WhatsAppContactContract[];
  ownedProperties: WhatsAppContactProperty[];
  rentedProperties: WhatsAppContactProperty[];
};

function firstNameFrom(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || fullName;
}

export async function lookupWhatsAppContact(
  organizationId: string,
  waContactPhone: string,
): Promise<WhatsAppContactProfile | null> {
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
      user: { select: { id: true, name: true, phone: true } },
    },
  });

  const member = members.find((m) => phonesMatch(m.user.phone, waContactPhone));
  if (!member) return null;

  const parties = await prisma.contractParty.findMany({
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
          property: { select: { title: true, status: true } },
        },
      },
    },
    orderBy: { contract: { startDate: "desc" } },
    take: 10,
  });

  const ownedProperties =
    member.role === "OWNER"
      ? await prisma.property.findMany({
          where: {
            organizationId,
            ownerships: { some: { ownerId: member.user.id } },
          },
          select: { title: true, status: true },
          orderBy: { title: "asc" },
          take: 10,
        })
      : [];

  const rentedProperties = parties
    .filter((p) => p.role === "TENANT")
    .map((p) => ({
      title: p.contract.property.title,
      status: p.contract.property.status,
    }));

  const isTenant =
    member.role === "TENANT" || parties.some((p) => p.role === "TENANT");
  const isOwner =
    member.role === "OWNER" ||
    parties.some((p) => p.role === "OWNER") ||
    ownedProperties.length > 0;
  const isClient = ["TENANT", "OWNER", "GUARANTOR"].includes(member.role);

  return {
    userId: member.user.id,
    name: member.user.name,
    firstName: firstNameFrom(member.user.name),
    orgRole: member.role,
    isClient,
    isTenant,
    isOwner,
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
