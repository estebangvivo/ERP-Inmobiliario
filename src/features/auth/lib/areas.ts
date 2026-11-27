/** Normaliza texto para comparar áreas (minúsculas, sin tildes). */
export function normalizeAreaText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/** Convierte "cobros, pagos; caja" en una lista limpia y sin duplicados. */
export function parseAreaKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const kw = part.trim().replace(/\s+/g, " ");
    if (kw.length < 2 || kw.length > 40) continue;
    const key = normalizeAreaText(kw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
    if (out.length >= 20) break;
  }
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Puntaje de coincidencia entre un texto libre y un área (nombre + palabras clave).
 * 0 = sin coincidencia. Coincide por palabra completa (admite plural simple).
 */
export function scoreAreaMatch(
  text: string,
  area: { name: string; keywords: string[] },
): number {
  const t = normalizeAreaText(text);
  if (!t) return 0;
  let best = 0;
  for (const term of [area.name, ...area.keywords]) {
    const n = normalizeAreaText(term);
    if (n.length < 2) continue;
    const base = n.endsWith("s") && n.length > 3 ? n.slice(0, -1) : n;
    const re = new RegExp(
      `(?:^|[^a-z0-9])${escapeRegex(base)}(?:s|es)?(?:$|[^a-z0-9])`,
    );
    if (re.test(t)) best = Math.max(best, n.length);
  }
  return best;
}
