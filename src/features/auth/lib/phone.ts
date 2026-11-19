/**
 * Teléfonos WhatsApp / ERP.
 * Argentina por defecto: 54 9 + área + número (ej. 353 428-9127 → 5493534289127).
 * Si el valor ya trae otro código de país (no 54), se respeta.
 */

/** Extrae corridas de dígitos útiles (ignora texto tipo "3534095786 - INES"). */
export function extractPhoneDigitCandidates(raw: string): string[] {
  if (!raw?.trim()) return [];
  const runs = raw.match(/\d[\d\s\-()/]{5,}\d/g) ?? [];
  const out: string[] = [];
  for (const run of runs) {
    const digits = run.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) out.push(digits);
  }
  const all = raw.replace(/\D/g, "");
  if (all.length >= 8 && all.length <= 15) out.push(all);
  return [...new Set(out)];
}

/**
 * Deja solo dígitos en formato internacional para wa.me / matching.
 * Números locales AR (10 dígitos, 0…, 15…) → 549…
 */
export function normalizeWhatsAppPhone(raw: string): string {
  const candidates = extractPhoneDigitCandidates(raw);
  const digits =
    candidates.sort((a, b) => b.length - a.length)[0] ??
    raw.replace(/\D/g, "");
  if (!digits) return "";

  let d = digits;
  if (d.startsWith("00")) d = d.slice(2);

  // Ya en formato AR móvil 549…
  if (d.startsWith("549") && d.length >= 12 && d.length <= 13) {
    return d;
  }

  // 54 sin el 9 de móvil → insertar 9
  if (d.startsWith("54") && !d.startsWith("549") && d.length >= 12) {
    return `549${d.slice(2)}`;
  }

  // Otro país (código ≠ 54) con largo internacional: respetar
  if (
    !d.startsWith("54") &&
    d.length >= 11 &&
    d.length <= 15 &&
    !d.startsWith("0") &&
    !d.startsWith("15")
  ) {
    return d;
  }

  if (d.startsWith("15") && d.length >= 10) {
    return `549${d.slice(2)}`;
  }

  if (d.startsWith("0") && d.length >= 10) {
    return `549${d.replace(/^0+/, "")}`;
  }

  // Local AR típico: 10 dígitos (área+número)
  if (d.length === 10) {
    return `549${d}`;
  }

  // 9 + 10 dígitos sin 54
  if (d.length === 11 && d.startsWith("9")) {
    return `54${d}`;
  }

  if (d.length >= 10 && d.length <= 15) {
    return d;
  }

  return "";
}

/**
 * Normaliza para guardar en Usuarios: AR (54/549) por defecto
 * salvo que el valor ya traiga otro código de país.
 */
export function canonicalizeStoredPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalizeWhatsAppPhone(raw);
  return normalized || raw.trim();
}

export function isValidWhatsAppPhone(raw: string): boolean {
  const n = normalizeWhatsAppPhone(raw);
  return n.length >= 11 && n.length <= 15;
}

/**
 * Compara teléfonos aunque estén guardados con distinto formato.
 * Evita matches flojos por endsWith de fragmentos cortos.
 */
export function phonesMatch(
  stored: string | null | undefined,
  waPhone: string,
): boolean {
  if (!stored?.trim() || !waPhone?.trim()) return false;

  const storedNorms = extractPhoneDigitCandidates(stored)
    .map((d) => normalizeWhatsAppPhone(d))
    .filter(Boolean);
  const primary = normalizeWhatsAppPhone(stored);
  if (primary) storedNorms.unshift(primary);

  const waNorm = normalizeWhatsAppPhone(waPhone);
  if (!waNorm) return false;

  const uniqueStored = [...new Set(storedNorms)];
  for (const a of uniqueStored) {
    if (a === waNorm) return true;
    // Mismo número nacional AR (últimos 10 dígitos), ambos ya normalizados
    if (a.length >= 12 && waNorm.length >= 12 && a.slice(-10) === waNorm.slice(-10)) {
      return true;
    }
  }
  return false;
}

/** Score 0–2: 2 match en teléfono principal, 1 en teléfono 2, 0 no match. */
export function phoneMatchStrength(
  phone: string | null | undefined,
  phone2: string | null | undefined,
  waPhone: string,
): 0 | 1 | 2 {
  if (phonesMatch(phone, waPhone)) return 2;
  if (phonesMatch(phone2, waPhone)) return 1;
  return 0;
}
