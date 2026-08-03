/**
 * Deja solo dígitos en formato internacional para wa.me.
 * Argentina móvil: 54 9 + área + número (ej. 11 5555-5555 → 5491155555555).
 */
export function normalizeWhatsAppPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("549") && digits.length >= 12) {
    return digits;
  }

  if (
    digits.startsWith("54") &&
    !digits.startsWith("549") &&
    digits.length >= 12
  ) {
    return `549${digits.slice(2)}`;
  }

  if (digits.startsWith("15") && digits.length >= 10) {
    return `549${digits.slice(2)}`;
  }

  if (digits.startsWith("0") && digits.length >= 10) {
    return `549${digits.replace(/^0+/, "")}`;
  }

  if (digits.length === 10) {
    return `549${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("9")) {
    return `54${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }

  return "";
}

export function isValidWhatsAppPhone(raw: string): boolean {
  const n = normalizeWhatsAppPhone(raw);
  return n.length >= 10 && n.length <= 15;
}
