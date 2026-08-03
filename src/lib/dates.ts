/** Formatea fecha a DD/MM/AAAA (zona local). */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseDateInput(value) : value;
  if (!d || Number.isNaN(d.getTime())) return "—";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Para inputs type="date" (valor interno YYYY-MM-DD). */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? parseDateInput(value) : value;
  if (!d || Number.isNaN(d.getTime())) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  // Prefer local for datetime, UTC for @db.Date from Prisma
  if (typeof value === "object" && value.getHours?.() === 0 && value.getMinutes?.() === 0) {
    // date-only from DB often midnight UTC
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parsea YYYY-MM-DD o DD/MM/AAAA. */
export function parseDateInput(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }

  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (dmy) {
    return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  }

  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Fecha solo-día desde Prisma Date (@db.Date) en DD/MM/AAAA sin desfase. */
export function formatDateOnly(value: Date | string | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return formatDate(value);
  }
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const year = value.getUTCFullYear();
  return `${day}/${month}/${year}`;
}
