/** Normaliza DNI/CUIT dejando solo dígitos. */
export function normalizeDni(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidDni(normalized: string): boolean {
  return normalized.length >= 7 && normalized.length <= 11;
}
