"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ETIQUETAS_CATEGORIA,
  esCategoria,
  type Categoria,
  type TurnoDTO,
} from "@/features/turnero/lib/turnos";
import { getMyAssignedTurneroPuesto } from "@/features/auth/actions/user-actions";
import {
  writeTurneroPuestoSession,
  type TurneroSesionPuesto,
} from "@/features/turnero/lib/puesto-session";

async function leerTurno(respuesta: Response) {
  const data = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(data.error ?? "La operación no pudo completarse");
  }
  return data as TurnoDTO;
}

/** Mini panel del operador en el sidebar del dashboard. */
export function OperadorSidebarWidget() {
  const [puesto, setPuesto] = useState<TurneroSesionPuesto | null>(null);
  const [turnos, setTurnos] = useState<TurnoDTO[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  const actualizar = useCallback(async () => {
    try {
      const respuesta = await fetch(
        `/api/turnero/turnos?scope=activos&t=${Date.now()}`,
        { cache: "no-store" },
      );
      if (!respuesta.ok) throw new Error();
      setTurnos((await respuesta.json()) as TurnoDTO[]);
      setError("");
    } catch {
      setError("Sin conexión");
    }
  }, []);

  useEffect(() => {
    async function iniciar() {
      try {
        // Solo si el usuario tiene puesto asignado en configuración
        const asignado = await getMyAssignedTurneroPuesto().catch(() => null);
        if (!asignado || !esCategoria(asignado.categoria)) return;

        const lista = (await fetch(`/api/turnero/puestos?t=${Date.now()}`, {
          cache: "no-store",
        }).then((r) => r.json())) as {
          id: string;
          nombre: string;
          categoria: string;
          activo: boolean;
        }[];

        const delUsuario = lista.find(
          (item) =>
            item.activo &&
            item.id === asignado.id &&
            esCategoria(item.categoria),
        );
        if (!delUsuario) return;

        const sesion: TurneroSesionPuesto = {
          id: delUsuario.id,
          nombre: delUsuario.nombre,
          categoria: delUsuario.categoria as Categoria,
        };
        setPuesto(sesion);
        writeTurneroPuestoSession(sesion);
      } catch {
        /* sin puesto → no mostrar widget */
      } finally {
        setListo(true);
      }
    }
    void iniciar();
  }, []);

  useEffect(() => {
    if (!puesto) return;
    void actualizar();
    const id = window.setInterval(() => void actualizar(), 2000);
    return () => window.clearInterval(id);
  }, [actualizar, puesto]);

  const turnoActual = useMemo(
    () =>
      puesto
        ? (turnos.find(
            (t) => t.estado === "LLAMADO" && t.puesto === puesto.nombre,
          ) ?? null)
        : null,
    [puesto, turnos],
  );

  const espera = useMemo(
    () =>
      puesto
        ? turnos.filter(
            (t) => t.categoria === puesto.categoria && t.estado === "ESPERA",
          )
        : [],
    [puesto, turnos],
  );

  async function ejecutar(accion: () => Promise<TurnoDTO>) {
    setCargando(true);
    setError("");
    try {
      await accion();
      await actualizar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setCargando(false);
    }
  }

  function llamarSiguiente() {
    if (!puesto) return;
    void ejecutar(async () =>
      leerTurno(
        await fetch("/api/turnero/turnos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: "LLAMAR_SIGUIENTE",
            categoria: puesto.categoria,
            puesto: puesto.nombre,
          }),
        }),
      ),
    );
  }

  function finalizar() {
    if (!puesto || !turnoActual) return;
    void ejecutar(async () =>
      leerTurno(
        await fetch(`/api/turnero/turnos/${turnoActual.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estado: "ATENDIDO",
            puesto: puesto.nombre,
          }),
        }),
      ),
    );
  }

  if (!listo || !puesto) return null;

  const hayPendientes = espera.length > 0 || turnoActual !== null;
  if (!hayPendientes) return null;

  const etiqueta = ETIQUETAS_CATEGORIA[puesto.categoria];

  return (
    <div className="mb-0 w-full overflow-hidden rounded-xl border border-white/10 bg-[var(--turnero-surface)] text-white shadow-sm">
      <a
        href="/turnero/operador"
        className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 hover:bg-[var(--turnero-elevated)]"
      >
        <div className="min-w-0">
          <p className="truncate text-[10px] font-extrabold uppercase tracking-[.2em] text-[var(--turnero-accent)]">
            Operador · {etiqueta}
          </p>
          <p className="truncate text-sm font-bold">{puesto.nombre}</p>
        </div>
        <span className="shrink-0 text-[10px] font-bold text-white/50">
          Abrir
        </span>
      </a>

      <div className="space-y-2 p-3">
        <div className="rounded-lg border border-white/10 bg-[var(--turnero-bg)] p-2.5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/50">
            Turno en atención
          </p>
          {turnoActual ? (
            <>
              <p className="mt-1 break-words text-center text-sm font-extrabold leading-snug text-[var(--turnero-accent)]">
                {turnoActual.codigo}
              </p>
              <button
                type="button"
                disabled={cargando}
                onClick={finalizar}
                className="mt-2 w-full rounded-md bg-[var(--turnero-accent)] px-2 py-1.5 text-xs font-extrabold text-[var(--turnero-accent-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                Finalizar
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-center text-xs font-bold text-white/50">
                Puesto disponible
              </p>
              <button
                type="button"
                disabled={cargando || espera.length === 0}
                onClick={llamarSiguiente}
                className="mt-2 w-full rounded-md bg-[var(--turnero-accent)] px-2 py-1.5 text-xs font-extrabold text-[var(--turnero-accent-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
              >
                {cargando ? "…" : "Llamar siguiente"}
              </button>
            </>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-[var(--turnero-elevated)] p-2.5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--turnero-accent)]">
            Cola de {etiqueta}
          </p>
          <p className="mt-1 text-3xl font-extrabold leading-none">
            {espera.length}
          </p>
          <p className="mt-0.5 text-[11px] text-white/50">
            {espera.length === 1 ? "en espera" : "en espera"}
          </p>
          {espera.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-2">
              {espera.slice(0, 3).map((turno) => (
                <span
                  key={turno.id}
                  className="max-w-full truncate rounded bg-[var(--turnero-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--turnero-accent)]"
                  title={turno.codigo}
                >
                  {turno.codigo}
                </span>
              ))}
              {espera.length > 3 && (
                <span className="text-[10px] text-white/50">
                  +{espera.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="text-[10px] font-medium text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
