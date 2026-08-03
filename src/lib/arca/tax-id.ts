/**
 * Utilidades para CUIT / CUIL / DNI (Argentina).
 */

export type TaxIdKind = "CUIT" | "DNI" | "UNKNOWN";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Formatea CUIT/CUIL como XX-XXXXXXXX-X */
export function formatCuit(value: string): string {
  const d = digitsOnly(value);
  if (d.length !== 11) return value.trim();
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/** Formatea mientras se escribe (máx. 11 dígitos). */
export function formatCuitInput(value: string): string {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

function checkDigitForBase10(base10: string): number {
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = base10.split("").map(Number);
  const sum = multipliers.reduce((acc, m, i) => acc + m * digits[i], 0);
  const mod = 11 - (sum % 11);
  if (mod === 11) return 0;
  if (mod === 10) return 9;
  return mod;
}

/** Valida dígito verificador de CUIT/CUIL. */
export function isValidCuit(value: string): boolean {
  const d = digitsOnly(value);
  if (!/^\d{11}$/.test(d)) return false;
  return checkDigitForBase10(d.slice(0, 10)) === Number(d[10]);
}

/**
 * Genera CUITs/CUILs posibles a partir de un DNI (prefijos 20/23/24/27).
 * Útil cuando el proveedor no resuelve DNI→CUIT.
 */
export function cuitCandidatesFromDni(dni: string): string[] {
  const raw = digitsOnly(dni);
  if (raw.length < 7 || raw.length > 8) return [];
  const padded = raw.padStart(8, "0");
  const prefixes = ["20", "23", "24", "27"];

  return prefixes
    .map((prefix) => {
      const base10 = `${prefix}${padded}`;
      return `${base10}${checkDigitForBase10(base10)}`;
    })
    .filter(isValidCuit);
}

export function detectTaxIdKind(value: string): TaxIdKind {
  const d = digitsOnly(value);
  if (d.length === 11 && isValidCuit(d)) return "CUIT";
  if (d.length === 7 || d.length === 8) return "DNI";
  if (d.length === 11) return "CUIT";
  return "UNKNOWN";
}

export function normalizeTaxIdInput(value: string): {
  kind: TaxIdKind;
  digits: string;
  formatted: string;
} {
  const digits = digitsOnly(value);
  const kind = detectTaxIdKind(digits);
  return {
    kind,
    digits,
    formatted: kind === "CUIT" ? formatCuit(digits) : digits,
  };
}
