export type ClienteDTO = {
  id: string;
  dni: string;
  nombre: string;
  creadoEn: string;
};

/** Deja solo dígitos; acepta DNI con puntos o espacios. */
export function normalizarDni(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digitos = String(value).replace(/\D/g, "");
  if (digitos.length < 7 || digitos.length > 8) return null;
  return digitos;
}

export function normalizarNombre(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nombre = value.trim().replace(/\s+/g, " ");
  if (nombre.length < 2 || nombre.length > 80) return null;
  return nombre;
}
