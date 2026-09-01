import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

type EnsureOrgInput = {
  slug: string;
  name: string;
  email?: string;
  city?: string;
  province?: string;
  country?: string;
  billingStatus?: "EXEMPT" | "PENDING_PAYMENT" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
  billingPlan?:
    | "TRIAL"
    | "SOLO_MONTHLY"
    | "SOLO_ANNUAL"
    | "TEAM_MONTHLY"
    | "TEAM_ANNUAL"
    | "UNLIMITED_MONTHLY"
    | "UNLIMITED_ANNUAL";
};

function newOrgId() {
  return `c${randomBytes(12).toString("hex")}`;
}

/**
 * Crea o actualiza una organización sin depender de columnas que aún no existen en DB
 * (p. ej. waGraphApiVersion). Prisma create falla si el schema está adelantado a la DB.
 */
export async function ensureOrganization(
  prisma: PrismaClient,
  input: EnsureOrgInput,
): Promise<{ id: string }> {
  const existing = await prisma.organization.findFirst({
    where: { slug: input.slug },
    select: { id: true },
  });

  if (existing) {
    const billingStatus = input.billingStatus ?? null;
    const billingPlan = input.billingPlan ?? null;
    await prisma.$executeRaw`
      UPDATE "erp_inmobiliario"."organizations"
      SET
        "name" = ${input.name},
        "billingStatus" = COALESCE(
          CAST(${billingStatus} AS "erp_inmobiliario"."BillingStatus"),
          "billingStatus"
        ),
        "billingPlan" = COALESCE(
          CAST(${billingPlan} AS "erp_inmobiliario"."BillingPlan"),
          "billingPlan"
        ),
        "updatedAt" = NOW()
      WHERE "id" = ${existing.id}
    `;
    return existing;
  }

  const id = newOrgId();
  const email = input.email ?? null;
  const city = input.city ?? null;
  const province = input.province ?? null;
  const country = input.country ?? "AR";
  const billingStatus = input.billingStatus ?? "PENDING_PAYMENT";
  const billingPlan = input.billingPlan ?? null;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "erp_inmobiliario"."organizations" (
      "id", "name", "slug", "email", "city", "province", "country",
      "billingStatus", "billingPlan", "createdAt", "updatedAt"
    ) VALUES (
      ${id},
      ${input.name},
      ${input.slug},
      ${email},
      ${city},
      ${province},
      ${country},
      CAST(${billingStatus} AS "erp_inmobiliario"."BillingStatus"),
      CAST(${billingPlan} AS "erp_inmobiliario"."BillingPlan"),
      NOW(),
      NOW()
    )
    RETURNING "id"
  `;

  return { id: rows[0]?.id ?? id };
}
