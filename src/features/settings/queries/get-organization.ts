import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  DEFAULT_ENABLED_CURRENCIES,
  normalizeCurrency,
  normalizeEnabledCurrencies,
} from "@/config/currencies";

export type OrganizationProfile = {
  id: string;
  name: string;
  legalName: string | null;
  slug: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  website: string | null;
  logoUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  whatsapp: string | null;
  themeId: string;
  currency: string;
  enabledCurrencies: string[];
  checkDueAlertDays: number;
  sessionIdleMinutes: number;
};

export async function getOrganizationProfile(): Promise<OrganizationProfile | null> {
  const session = await requireSession();

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: {
      id: true,
      name: true,
      legalName: true,
      slug: true,
      taxId: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      province: true,
      postalCode: true,
      country: true,
      website: true,
      logoUrl: true,
      facebookUrl: true,
      instagramUrl: true,
      linkedinUrl: true,
      xUrl: true,
      whatsapp: true,
      themeId: true,
      currency: true,
      enabledCurrencies: true,
      checkDueAlertDays: true,
      sessionIdleMinutes: true,
    },
  });

  if (!org) return null;

  const sessionIdleMinutes = Math.min(
    480,
    Math.max(5, org.sessionIdleMinutes ?? 30),
  );

  return {
    ...org,
    currency: normalizeCurrency(org.currency),
    enabledCurrencies: normalizeEnabledCurrencies(
      org.enabledCurrencies,
      org.currency,
    ),
    checkDueAlertDays: Math.max(0, org.checkDueAlertDays ?? 7),
    sessionIdleMinutes,
  };
}

/** Moneda principal de reporte. */
export async function getOrganizationCurrency(): Promise<string> {
  const profile = await getOrganizationProfile();
  return profile?.currency ?? "ARS";
}

/** Monedas habilitadas para operar (multimoneda). */
export async function getEnabledCurrencies(): Promise<string[]> {
  const profile = await getOrganizationProfile();
  return profile?.enabledCurrencies ?? [...DEFAULT_ENABLED_CURRENCIES];
}
