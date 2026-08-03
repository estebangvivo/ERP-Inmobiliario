/** Fecha visible en UI: DD/MM/AAAA (zona local). */
export function formatDateAR(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "—";
  const date =
    value instanceof Date
      ? value
      : new Date(
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? `${value}T12:00:00`
            : value,
        );
  if (Number.isNaN(date.getTime())) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
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
