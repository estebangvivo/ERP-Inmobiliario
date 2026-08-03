"use server";

import { revalidatePath } from "next/cache";
import { requireAuthSession } from "@/lib/auth";
import { requirePlatformSuperadmin } from "@/features/auth/lib/platform-admin";
import {
  getMercadoPagoConfigPublic,
  upsertMercadoPagoSettings,
  type MercadoPagoConfigPublic,
} from "@/features/billing/lib/platform-billing-settings";

export async function getAdminMercadoPagoConfig(): Promise<MercadoPagoConfigPublic | null> {
  try {
    const session = await requireAuthSession();
    requirePlatformSuperadmin(session);
    return getMercadoPagoConfigPublic();
  } catch {
    return null;
  }
}

export async function saveAdminMercadoPagoConfig(input: {
  accessToken?: string;
  publicKey?: string;
  clearToken?: boolean;
  clearPublicKey?: boolean;
  surchargePercent?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireAuthSession();
    requirePlatformSuperadmin(session);

    const token = input.accessToken?.trim() ?? "";
    if (token && !token.startsWith("TEST-") && !token.startsWith("APP_USR-")) {
      return {
        ok: false,
        error:
          "El Access Token debería empezar con TEST- (prueba) o APP_USR- (producción).",
      };
    }

    if (
      input.surchargePercent != null &&
      (!Number.isFinite(input.surchargePercent) ||
        input.surchargePercent < 0 ||
        input.surchargePercent > 100)
    ) {
      return {
        ok: false,
        error: "El recargo debe ser un porcentaje entre 0 y 100.",
      };
    }

    await upsertMercadoPagoSettings({
      accessToken: input.clearToken ? null : token || undefined,
      publicKey: input.clearPublicKey
        ? null
        : input.publicKey?.trim() || undefined,
      clearToken: Boolean(input.clearToken),
      clearPublicKey: Boolean(input.clearPublicKey),
      surchargePercent: input.surchargePercent,
    });

    revalidatePath("/admin");
    revalidatePath("/onboarding/pago");
    revalidatePath("/onboarding/planes");
    return { ok: true };
  } catch (error) {
    console.error("saveAdminMercadoPagoConfig", error);
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return { ok: false, error: "Sin permiso de superadmin." };
    }
    return { ok: false, error: "No se pudo guardar Mercado Pago." };
  }
}
