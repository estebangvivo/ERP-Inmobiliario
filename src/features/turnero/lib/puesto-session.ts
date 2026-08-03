import type { Categoria } from "@/features/turnero/lib/turnos";

export const TURNERO_PUESTO_STORAGE_KEY = "erp-turnero-puesto";

export type TurneroSesionPuesto = {
  id: string;
  nombre: string;
  categoria: Categoria;
};

export function readTurneroPuestoSession(): TurneroSesionPuesto | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TURNERO_PUESTO_STORAGE_KEY);
  if (!raw) return null;
  try {
    const valor = JSON.parse(raw) as TurneroSesionPuesto;
    if (
      typeof valor?.id === "string" &&
      typeof valor?.nombre === "string" &&
      typeof valor?.categoria === "string"
    ) {
      return valor;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeTurneroPuestoSession(puesto: TurneroSesionPuesto) {
  window.localStorage.setItem(
    TURNERO_PUESTO_STORAGE_KEY,
    JSON.stringify(puesto),
  );
}

export function clearTurneroPuestoSession() {
  window.localStorage.removeItem(TURNERO_PUESTO_STORAGE_KEY);
}
