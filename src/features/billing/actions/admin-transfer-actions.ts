"use server";

import { revalidatePath } from "next/cache";
import { requireAuthSession } from "@/lib/auth";
import { requirePlatformSuperadmin } from "@/features/auth/lib/platform-admin";
import {
  getTransferBankDetailsEffective,
  upsertTransferBankSettings,
  type TransferBankDetails,
} from "@/features/billing/lib/platform-billing-settings";

export async function getAdminTransferBankConfig(): Promise<TransferBankDetails | null> {
  try {
    const session = await requireAuthSession();
    requirePlatformSuperadmin(session);
    return getTransferBankDetailsEffective();
  } catch {
    return null;
  }
}

export async function saveAdminTransferBankConfig(
  input: TransferBankDetails,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireAuthSession();
    requirePlatformSuperadmin(session);

    if (!input.aliasArs.trim() && !input.cbuArs.trim()) {
      return {
        ok: false,
        error: "Indicá al menos un alias o un CBU para transferencias en ARS.",
      };
    }

    await upsertTransferBankSettings({ details: input });

    revalidatePath("/admin");
    revalidatePath("/onboarding/pago");
    return { ok: true };
  } catch (error) {
    console.error("saveAdminTransferBankConfig", error);
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return { ok: false, error: "Sin permiso de superadmin." };
    }
    return { ok: false, error: "No se pudo guardar transferencia." };
  }
}
