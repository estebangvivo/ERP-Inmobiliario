"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { formatCuit, digitsOnly } from "@/lib/arca/tax-id";
import { COLOR_PALETTES, DEFAULT_THEME_ID } from "@/config/themes";
import {
  normalizeCurrency,
  normalizeEnabledCurrencies,
  parseEnabledCurrenciesField,
} from "@/config/currencies";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

function canManage(role: string) {
  return role === "ADMIN";
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

/**
 * Guarda el logo como data URL en DB (no en disco).
 * En Railway el filesystem es efímero y /uploads/logos se pierde al redeploy.
 */
async function saveLogoFile(_organizationId: string, file: File): Promise<string> {
  if (!LOGO_TYPES.has(file.type)) {
    throw new Error("El logo debe ser PNG, JPG, WEBP o SVG.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("El logo no puede superar 2 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  return `data:${file.type};base64,${base64}`;
}

export async function updateOrganizationProfile(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireSession();

    const targetOrgId =
      emptyToNull(formData.get("organizationId")) ?? session.organizationId;

    if (targetOrgId !== session.organizationId) {
      const membership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: targetOrgId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      if (!membership || membership.role !== "ADMIN") {
        return {
          ok: false,
          error: "Solo un Admin de esa empresa puede editarla.",
        };
      }
    } else if (!canManage(session.organizationRole)) {
      return {
        ok: false,
        error: "No tenés permiso para editar la inmobiliaria.",
      };
    }

    const name = emptyToNull(formData.get("name"));
    if (!name) {
      return { ok: false, error: "El nombre comercial es obligatorio." };
    }

    const logoFile = formData.get("logo");
    let logoUrl: string | undefined;
    if (logoFile instanceof File && logoFile.size > 0) {
      logoUrl = await saveLogoFile(targetOrgId, logoFile);
    }

    const clearLogo = formData.get("clearLogo") === "1";

    const rawTaxId = emptyToNull(formData.get("taxId"));
    const taxId = rawTaxId
      ? digitsOnly(rawTaxId).length === 11
        ? formatCuit(rawTaxId)
        : rawTaxId
      : null;

    const requestedTheme = emptyToNull(formData.get("themeId")) ?? DEFAULT_THEME_ID;
    const themeId = COLOR_PALETTES.some((p) => p.id === requestedTheme)
      ? requestedTheme
      : DEFAULT_THEME_ID;

    const currency = normalizeCurrency(emptyToNull(formData.get("currency")));
    const enabledCurrencies = normalizeEnabledCurrencies(
      parseEnabledCurrenciesField(formData.get("enabledCurrencies")),
      currency,
    );

    const rawAlertDays = emptyToNull(formData.get("checkDueAlertDays"));
    const checkDueAlertDays = rawAlertDays
      ? Math.min(365, Math.max(0, Math.round(Number(rawAlertDays))))
      : 7;
    if (!Number.isFinite(checkDueAlertDays)) {
      return {
        ok: false,
        error: "Los días de aviso de cheques deben ser un número válido.",
      };
    }

    const rawDueDay = emptyToNull(formData.get("billDueDay"));
    const billDueDay = rawDueDay
      ? Math.min(28, Math.max(1, Math.round(Number(rawDueDay))))
      : 10;
    if (!Number.isFinite(billDueDay)) {
      return {
        ok: false,
        error: "El día de vencimiento de cuotas debe ser entre 1 y 28.",
      };
    }

    const rawIdle = emptyToNull(formData.get("sessionIdleMinutes"));
    const sessionIdleMinutes = rawIdle
      ? Math.min(480, Math.max(5, Math.round(Number(rawIdle))))
      : 30;
    if (!Number.isFinite(sessionIdleMinutes)) {
      return {
        ok: false,
        error: "Los minutos de inactividad deben ser un número válido (5–480).",
      };
    }

    await prisma.organization.update({
      where: { id: targetOrgId },
      data: {
        name,
        legalName: emptyToNull(formData.get("legalName")),
        taxId,
        email: emptyToNull(formData.get("email")),
        phone: emptyToNull(formData.get("phone")),
        address: emptyToNull(formData.get("address")),
        city: emptyToNull(formData.get("city")),
        province: emptyToNull(formData.get("province")),
        postalCode: emptyToNull(formData.get("postalCode")),
        country: emptyToNull(formData.get("country")) ?? "AR",
        website: emptyToNull(formData.get("website")),
        facebookUrl: emptyToNull(formData.get("facebookUrl")),
        instagramUrl: emptyToNull(formData.get("instagramUrl")),
        linkedinUrl: emptyToNull(formData.get("linkedinUrl")),
        xUrl: emptyToNull(formData.get("xUrl")),
        whatsapp: emptyToNull(formData.get("whatsapp")),
        themeId,
        currency,
        enabledCurrencies,
        checkDueAlertDays,
        billDueDay,
        sessionIdleMinutes,
        ...(logoUrl ? { logoUrl } : clearLogo ? { logoUrl: null } : {}),
      },
    });

    revalidatePath("/", "layout");
    revalidatePath("/ajustes");
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("updateOrganizationProfile", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar la configuración.",
    };
  }
}
