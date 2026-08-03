"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CATEGORIAS,
  ETIQUETAS_CATEGORIA,
  esCategoria,
  type Categoria,
  type TurnoDTO,
} from "@/features/turnero/lib/turnos";
import { TurneroLogo } from "@/features/turnero/components/turnero-brand";
import { getMyAssignedTurneroPuesto } from "@/features/auth/actions/user-actions";
import {
  clearTurneroPuestoSession,
  readTurneroPuestoSession,
  writeTurneroPuestoSession,
  type TurneroSesionPuesto,
} from "@/features/turnero/lib/puesto-session";

type Puesto = {
  id: string;
  nombre: string;
  categoria: Categoria;
  activo: boolean;
};

type SesionPuesto = TurneroSesionPuesto;

async function leerTurno(respuesta: Response) {
  const data = await respuesta.json();
  if (!respuesta.ok) throw new Error(data.error ?? "La operación no pudo completarse");
  return data as TurnoDTO;
}

export default function OperadorPage() {
  const [puesto, setPuesto] = useState<SesionPuesto | null>(null);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [turnos, setTurnos] = useState<TurnoDTO[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [inicializado, setInicializado] = useState(false);
  const [modoAbm, setModoAbm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formCategoria, setFormCategoria] = useState<Categoria>("CAJA");

  const cargarPuestos = useCallback(async () => {
    const respuesta = await fetch(`/api/turnero/puestos?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!respuesta.ok) throw new Error("No se pudieron cargar los puestos");
    setPuestos((await respuesta.json()) as Puesto[]);
  }, []);

  const actualizar = useCallback(async () => {
    try {
      const respuesta = await fetch(`/api/turnero/turnos?scope=activos&t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!respuesta.ok) throw new Error();
      setTurnos((await respuesta.json()) as TurnoDTO[]);
    } catch {
      setError("No se pudo conectar con el servidor");
    }
  }, []);

  useEffect(() => {
    async function iniciar() {
      try {
        const [lista, asignado] = await Promise.all([
          fetch(`/api/turnero/puestos?t=${Date.now()}`, {
            cache: "no-store",
          }).then((r) => r.json()) as Promise<Puesto[]>,
          getMyAssignedTurneroPuesto().catch(() => null),
        ]);
        setPuestos(lista);

        const activos = lista.filter((item) => item.activo);

        // Preferencia de este equipo (puede cambiarse en la pantalla de selección)
        const guardado = readTurneroPuestoSession();
        if (guardado) {
          const valido = activos.find(
            (item) =>
              item.id === guardado.id &&
              item.nombre === guardado.nombre &&
              item.categoria === guardado.categoria,
          );
          if (valido) {
            setPuesto({
              id: valido.id,
              nombre: valido.nombre,
              categoria: valido.categoria,
            });
            return;
          }
          clearTurneroPuestoSession();
        }

        // Si no hay preferencia de equipo, usar el puesto asignado al usuario
        if (asignado && esCategoria(asignado.categoria)) {
          const delUsuario = activos.find((item) => item.id === asignado.id);
          if (delUsuario) {
            const sesion: SesionPuesto = {
              id: delUsuario.id,
              nombre: delUsuario.nombre,
              categoria: delUsuario.categoria,
            };
            setPuesto(sesion);
            writeTurneroPuestoSession(sesion);
          }
        }
      } catch {
        setError("No se pudieron cargar los puestos");
      } finally {
        setInicializado(true);
      }
    }
    void iniciar();
  }, []);

  useEffect(() => {
    if (!puesto) return;
    void actualizar();
    const intervalo = window.setInterval(actualizar, 1000);
    return () => window.clearInterval(intervalo);
  }, [actualizar, puesto]);

  const turnoActual = useMemo(
    () =>
      puesto
        ? turnos.find(
            (turno) => turno.estado === "LLAMADO" && turno.puesto === puesto.nombre,
          ) ?? null
        : null,
    [puesto, turnos],
  );

  const espera = useMemo(
    () =>
      puesto
        ? turnos.filter(
            (turno) =>
              turno.categoria === puesto.categoria && turno.estado === "ESPERA",
          )
        : [],
    [puesto, turnos],
  );

  function seleccionar(item: Puesto) {
    const sesion = {
      id: item.id,
      nombre: item.nombre,
      categoria: item.categoria,
    };
    setPuesto(sesion);
    setError("");
    setModoAbm(false);
    writeTurneroPuestoSession(sesion);
  }

  function limpiarFormulario() {
    setEditandoId(null);
    setFormNombre("");
    setFormCategoria("CAJA");
  }

  function empezarEdicion(item: Puesto) {
    setEditandoId(item.id);
    setFormNombre(item.nombre);
    setFormCategoria(item.categoria);
    setError("");
  }

  async function guardarPuesto(event: FormEvent) {
    event.preventDefault();
    setGuardando(true);
    setError("");

    try {
      const respuesta = await fetch(
        editandoId ? `/api/turnero/puestos/${editandoId}` : "/api/turnero/puestos",
        {
          method: editandoId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: formNombre,
            categoria: formCategoria,
          }),
        },
      );
      const data = await respuesta.json();
      if (!respuesta.ok) throw new Error(data.error ?? "No se pudo guardar el puesto");

      await cargarPuestos();
      limpiarFormulario();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarPuesto(item: Puesto) {
    if (!window.confirm(`¿Dar de baja el puesto "${item.nombre}"?`)) return;
    setGuardando(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/turnero/puestos/${item.id}`, {
        method: "DELETE",
      });
      const data = await respuesta.json();
      if (!respuesta.ok) throw new Error(data.error ?? "No se pudo eliminar");
      if (editandoId === item.id) limpiarFormulario();
      await cargarPuestos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setGuardando(false);
    }
  }

  async function ejecutar(accion: () => Promise<TurnoDTO>) {
    setCargando(true);
    setError("");
    try {
      await accion();
      await actualizar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
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

  function actualizarActual(estado: "LLAMADO" | "ATENDIDO" | "CANCELADO") {
    if (!puesto || !turnoActual) return;
    void ejecutar(async () =>
      leerTurno(
        await fetch(`/api/turnero/turnos/${turnoActual.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado, puesto: puesto.nombre }),
        }),
      ),
    );
  }

  if (!inicializado) {
    return <main className="min-h-dvh bg-[var(--turnero-bg)]" />;
  }

  if (!puesto) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-5">
        <section className="w-full max-w-4xl rounded-3xl border border-[var(--turnero-border)] bg-[var(--turnero-surface)] p-6 shadow-2xl sm:p-10">
          <div className="mb-6 flex justify-center">
            <TurneroLogo sizeClass="size-16" />
          </div>
          <p className="text-center text-sm font-extrabold uppercase tracking-[.3em] text-[var(--turnero-accent)]">
            Panel de operador
          </p>
          <h1 className="mt-2 text-center text-4xl font-bold text-white sm:text-5xl">
            {modoAbm ? "Administrar puestos" : "Seleccione su puesto"}
          </h1>
          <p className="mt-3 text-center text-lg text-white/50">
            {modoAbm
              ? "Alta, edición y baja de puestos para las 4 áreas."
              : "La selección quedará guardada en este equipo."}
          </p>

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setModoAbm((v) => !v);
                limpiarFormulario();
                setError("");
              }}
              className="rounded-xl border border-[var(--turnero-accent)] px-5 py-3 font-extrabold text-[var(--turnero-accent)] hover:bg-[var(--turnero-accent)] hover:text-[var(--turnero-accent-foreground)]"
            >
              {modoAbm ? "Volver a selección" : "Administrar puestos (ABM)"}
            </button>
          </div>

          {!modoAbm ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {puestos.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => seleccionar(item)}
                  className="rounded-2xl border-2 border-white/10 bg-[var(--turnero-elevated)] p-5 text-left transition hover:border-[var(--turnero-accent)] hover:bg-[var(--turnero-elevated)]"
                >
                  <span className="block text-xl font-extrabold text-white">{item.nombre}</span>
                  <span className="mt-1 block text-sm font-bold uppercase tracking-wider text-[var(--turnero-accent)]">
                    {ETIQUETAS_CATEGORIA[item.categoria]}
                  </span>
                </button>
              ))}
              {!puestos.length && (
                <p className="col-span-full rounded-2xl border border-dashed border-white/10 p-6 text-center text-white/50">
                  No hay puestos activos. Usá el ABM para dar de alta el primero.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              <form
                onSubmit={guardarPuesto}
                className="rounded-2xl border border-white/10 bg-[var(--turnero-elevated)] p-5 sm:p-6"
              >
                <p className="mb-4 text-sm font-extrabold uppercase tracking-[.2em] text-[var(--turnero-accent)]">
                  {editandoId ? "Editar puesto" : "Nuevo puesto"}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-bold text-white/50">Nombre</span>
                    <input
                      required
                      value={formNombre}
                      onChange={(e) => setFormNombre(e.target.value)}
                      placeholder="Ej: Caja 3"
                      className="w-full rounded-xl border border-white/10 bg-[var(--turnero-surface)] px-4 py-3 text-white outline-none focus:border-[var(--turnero-accent)]"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-bold text-white/50">
                      Tipo de atención
                    </span>
                    <select
                      value={formCategoria}
                      onChange={(e) => setFormCategoria(e.target.value as Categoria)}
                      className="w-full rounded-xl border border-white/10 bg-[var(--turnero-surface)] px-4 py-3 text-white outline-none focus:border-[var(--turnero-accent)]"
                    >
                      {CATEGORIAS.map((cat) => (
                        <option key={cat} value={cat}>
                          {ETIQUETAS_CATEGORIA[cat]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={guardando || formNombre.trim().length < 2}
                    className="rounded-xl bg-[var(--turnero-accent)] text-[var(--turnero-accent-foreground)] hover:opacity-90 disabled:opacity-50"
                  >
                    {guardando
                      ? "Guardando…"
                      : editandoId
                        ? "Guardar cambios"
                        : "Dar de alta"}
                  </button>
                  {editandoId && (
                    <button
                      type="button"
                      onClick={limpiarFormulario}
                      className="rounded-xl border border-white/10 px-5 py-3 font-bold text-white/65 hover:border-[var(--turnero-accent)] hover:text-[var(--turnero-accent)]"
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
              </form>

              <div className="space-y-3">
                {puestos.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[var(--turnero-elevated)] p-4"
                  >
                    <div>
                      <p className="text-lg font-extrabold text-white">{item.nombre}</p>
                      <p className="text-sm font-bold uppercase tracking-wider text-[var(--turnero-accent)]">
                        {ETIQUETAS_CATEGORIA[item.categoria]}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={guardando}
                        onClick={() => empezarEdicion(item)}
                        className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold text-white/80 hover:border-[var(--turnero-accent)] hover:text-[var(--turnero-accent)] disabled:opacity-50"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={guardando}
                        onClick={() => void eliminarPuesto(item)}
                        className="rounded-lg border border-red-800 px-3 py-2 text-sm font-bold text-red-400 hover:bg-red-950/50 disabled:opacity-50"
                      >
                        Baja
                      </button>
                    </div>
                  </div>
                ))}
                {!puestos.length && (
                  <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-white/50">
                    Todavía no hay puestos cargados.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-6 rounded-xl bg-red-950/60 p-4 text-center font-bold text-red-300">
              {error}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh">
      <header className="border-b border-[var(--turnero-border)] bg-[var(--turnero-surface)] px-5 py-5 text-white sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <TurneroLogo sizeClass="size-12" />
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.3em] text-[var(--turnero-accent)]">
                Operador · {ETIQUETAS_CATEGORIA[puesto.categoria]}
              </p>
              <h1 className="mt-1 text-3xl font-extrabold">{puesto.nombre}</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPuesto(null);
              setTurnos([]);
              clearTurneroPuestoSession();
            }}
            className="rounded-xl bg-[var(--turnero-accent)] text-[var(--turnero-accent-foreground)] appearance-none hover:opacity-90 [-webkit-tap-highlight-color:transparent]"
          >
            Cambiar puesto
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 p-5 sm:p-10 lg:grid-cols-[1.35fr_.65fr]">
        <section className="rounded-3xl border border-[var(--turnero-border)] bg-[var(--turnero-surface)] p-6 shadow-lg sm:p-10">
          <p className="text-sm font-extrabold uppercase tracking-[.25em] text-white/50">
            Turno en atención
          </p>
          {turnoActual ? (
            <>
              <p className="my-7 break-words text-center text-3xl font-extrabold leading-tight text-[var(--turnero-accent)] sm:text-5xl">
                {turnoActual.codigo}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={cargando}
                  onClick={() => actualizarActual("LLAMADO")}
                  className="rounded-2xl border-2 border-[var(--turnero-accent)] bg-transparent px-6 py-5 text-xl font-extrabold text-[var(--turnero-accent)] hover:bg-[var(--turnero-accent)]/10 disabled:opacity-50"
                >
                  Re-llamar
                </button>
                <button
                  type="button"
                  disabled={cargando}
                  onClick={() => actualizarActual("ATENDIDO")}
                  className="rounded-2xl bg-[var(--turnero-accent)] text-[var(--turnero-accent-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  Finalizar turno
                </button>
              </div>
              <button
                type="button"
                disabled={cargando}
                onClick={() => actualizarActual("CANCELADO")}
                className="mt-3 w-full rounded-xl px-5 py-3 font-bold text-white/50 hover:bg-red-950/40 hover:text-red-400 disabled:opacity-50"
              >
                Cancelar turno
              </button>
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="text-3xl font-extrabold text-white/50">Puesto disponible</p>
              <button
                type="button"
                disabled={cargando || espera.length === 0}
                onClick={llamarSiguiente}
                className="mt-8 w-full rounded-2xl bg-[var(--turnero-accent)] text-[var(--turnero-accent-foreground)] shadow-lg hover:opacity-90 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-white/50"
              >
                {cargando ? "Llamando…" : "Llamar siguiente"}
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-red-950/60 p-4 font-bold text-red-300">
              {error}
            </p>
          )}
        </section>

        <aside className="rounded-3xl border border-[var(--turnero-border)] bg-[var(--turnero-elevated)] p-6 text-white shadow-lg sm:p-8">
          <p className="text-sm font-extrabold uppercase tracking-[.25em] text-[var(--turnero-accent)]">
            Cola de {ETIQUETAS_CATEGORIA[puesto.categoria]}
          </p>
          <p className="my-5 text-8xl font-extrabold">{espera.length}</p>
          <p className="text-xl text-white/50">
            {espera.length === 1 ? "persona en espera" : "personas en espera"}
          </p>
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="mb-3 font-bold text-white/50">Próximos</p>
            <div className="flex flex-wrap gap-2">
              {espera.slice(0, 6).map((turno) => (
                <span
                  key={turno.id}
                  className="rounded-lg bg-[var(--turnero-bg)] px-3 py-2 text-sm font-extrabold leading-tight text-[var(--turnero-accent)]"
                >
                  {turno.codigo}
                </span>
              ))}
              {!espera.length && <span className="text-white/40">Sin turnos pendientes</span>}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
