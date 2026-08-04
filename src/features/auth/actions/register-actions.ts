"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/features/auth/lib/password";
import { isValidWhatsAppPhone } from "@/features/auth/lib/phone";
import {
  setLocalSessionCookie,
  signLocalSession,
} from "@/features/auth/lib/session";

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: string };

/** Registro público (sin inmobiliaria). Luego va a onboarding/planes. */
export async function registerWithPassword(input: {
  email: string;
  password: string;
  confirmPassword?: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  /** Compat: nombre completo si no se envían first/last. */
  name?: string;
}): Promise<RegisterResult> {
  try {
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    const phone = input.phone.trim();
    const firstName = input.firstName?.trim() || "";
    const lastName = input.lastName?.trim() || "";
    const name =
      [firstName, lastName].filter(Boolean).join(" ") ||
      input.name?.trim() ||
      "";

    if (!email || !password) {
      return { ok: false, error: "Completá email y contraseña." };
    }
    if (!email.includes("@")) {
      return { ok: false, error: "Email inválido." };
    }
    if (name.length < 2) {
      return { ok: false, error: "Indicá tu nombre." };
    }

    const strength = validatePasswordStrength(password);
    if (!strength.ok) return { ok: false, error: strength.error };

    if (
      input.confirmPassword != null &&
      password !== input.confirmPassword
    ) {
      return { ok: false, error: "Las contraseñas no coinciden." };
    }

    if (!phone) {
      return { ok: false, error: "Indicá tu teléfono celular." };
    }
    if (!isValidWhatsAppPhone(phone)) {
      return {
        ok: false,
        error:
          "Teléfono inválido. Usá código de área (ej. 11 5555-5555 o +54 9 11 …).",
      };
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return {
        ok: false,
        error: "Ya existe una cuenta con ese email. Iniciá sesión.",
      };
    }

    const user = await prisma.user.create({
      data: {
        authId: `local:${email}`,
        email,
        name,
        phone,
        passwordHash: await hashPassword(password),
        lastActivityAt: new Date(),
      },
    });

    const token = await signLocalSession({
      userId: user.id,
      organizationId: null,
      email,
    });
    await setLocalSessionCookie(token);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("registerWithPassword", error);
    return { ok: false, error: "No se pudo crear la cuenta." };
  }
}
