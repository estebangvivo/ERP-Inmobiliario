import {
  formatDateOnly,
  toDateInputValue as toDateInputValueFromDates,
} from "@/lib/dates";

/**
 * Fecha visible en UI: DD/MM/AAAA.
 * Delega en formatDateOnly (UTC para @db.Date) para evitar día corrido.
 */
export function formatDateAR(value: Date | string | null | undefined): string {
  return formatDateOnly(value);
}

/** Fecha y hora visibles: DD/MM/AAAA HH:mm (zona local). */
export function formatDateTimeAR(
  value: Date | string | null | undefined,
): string {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function toDateInputValue(
  value: Date | string | null | undefined,
): string {
  return toDateInputValueFromDates(value);
}

export function isoToDateAR(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function parseDateARToIso(ar: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ar.trim());
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function maskDateARInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
