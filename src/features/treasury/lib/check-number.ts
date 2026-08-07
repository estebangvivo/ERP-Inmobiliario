/** Prefijo obligatorio para cheques electrónicos. */
export const ELECTRONIC_CHECK_PREFIX = "E-";

export function isElectronicCheckNumber(
  number: string | null | undefined,
): boolean {
  return Boolean(number?.trim().toUpperCase().startsWith(ELECTRONIC_CHECK_PREFIX));
}

/**
 * Normaliza el número de cheque.
 * Electrónico → siempre empieza con E- (sin duplicar el prefijo).
 * Físico → quita un prefijo E- accidental.
 */
export function normalizeCheckNumber(
  raw: string | null | undefined,
  isElectronic: boolean,
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  const withoutPrefix = trimmed.replace(/^E-/i, "").trim();
  if (!withoutPrefix) return "";
  return isElectronic
    ? `${ELECTRONIC_CHECK_PREFIX}${withoutPrefix}`
    : withoutPrefix;
}

export function checkFormatLabel(isElectronic: boolean): string {
  return isElectronic ? "Cheque electrónico" : "Cheque físico";
}
