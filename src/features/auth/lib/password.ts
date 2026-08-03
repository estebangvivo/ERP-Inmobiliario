import { compare, hash } from "bcryptjs";

const ROUNDS = 10;
const PASSWORD_MIN_LENGTH = 8;

/** Mayúscula, número y carácter especial; mínimo 8 caracteres. */
export function validatePasswordStrength(
  password: string,
): { ok: true } | { ok: false; error: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }
  if (!/[A-ZÁÉÍÓÚÜÑ]/.test(password)) {
    return {
      ok: false,
      error: "La contraseña debe incluir al menos una letra mayúscula.",
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      ok: false,
      error: "La contraseña debe incluir al menos un número.",
    };
  }
  if (!/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]/.test(password)) {
    return {
      ok: false,
      error:
        "La contraseña debe incluir al menos un carácter especial (ej. !@#$%).",
    };
  }
  return { ok: true };
}

export const PASSWORD_RULES_HINT =
  "Mínimo 8 caracteres, con mayúscula, número y un carácter especial (!@#$%).";

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(plain, passwordHash);
}
