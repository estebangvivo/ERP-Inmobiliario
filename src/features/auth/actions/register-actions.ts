"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/features/auth/lib/password";
import {
  setLocalSessionCookie,
  signLocalSession,
} from "@/features/auth/lib/session";

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: string };

export async function registerWithPassword(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  try {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    if (name.length < 2) {
      return { ok: false, error: "Indicá tu nombre." };
    }
    if (!email.includes("@")) {
      return { ok: false, error: "Email inválido." };
    }
    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.ok) return { ok: false, error: pwdCheck.error };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, error: "Ya existe una cuenta con ese email." };
    }

    const user = await prisma.user.create({
      data: {
        authId: `local:${email}`,
        email,
        name,
        passwordHash: await hashPassword(password),
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
