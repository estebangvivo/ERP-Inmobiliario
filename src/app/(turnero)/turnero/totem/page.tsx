"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ClienteDTO } from "@/features/turnero/lib/clientes";
import {
  ETIQUETAS_CATEGORIA,
  type Categoria,
  type TurnoDTO,
} from "@/features/turnero/lib/turnos";
import { TurneroLogo } from "@/features/turnero/components/turnero-brand";

type Paso = "dni" | "nombre" | "categorias";

const opciones: Array<{
  categoria: Categoria;
  titulo: string;
  descripcion: string;
  icono: string;
}> = [
  {
    categoria: "CAJA",
    titulo: "CAJA",
    descripcion: "Pagos y cobranzas",
    icono: "$",
  },
  {
    categoria: "VENTAS_ALQUILERES",
    titulo: "VENTAS/\nALQUILERES",
    descripcion: "Compra, venta y alquileres",
    icono: "V",
  },
  {
    categoria: "OBRAS",
    titulo: "OBRAS",
    descripcion: "Construcción y proyectos",
    icono: "O",
  },
  {
    categoria: "CONTRATOS",
    titulo: "CONTRATOS",
    descripcion: "Firma y gestión de contratos",
    icono: "C",
  },
];

function soloDigitos(value: string) {
  return value.replace(/\D/g, "");
}

function Logo() {
  return (
    <div className="mb-6 flex justify-center">
      <TurneroLogo sizeClass="size-20 sm:size-24" />
    </div>
  );
}

export default function TotemPage() {
  const [paso, setPaso] = useState<Paso>("dni");
  const [dni, setDni] = useState("");
  const [dniListo, setDniListo] = useState(false);
  const [cliente, setCliente] = useState<ClienteDTO | null>(null);
  const [cargandoLogin, setCargandoLogin] = useState(false);
  const [cargando, setCargando] = useState<Categoria | null>(null);
  const [turno, setTurno] = useState<TurnoDTO | null>(null);
  const [error, setError] = useState("");

  const dniRef = useRef<HTMLInputElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  // Silk a veces no dispara onChange de React; onInput + lectura del DOM sí.
  useEffect(() => {
    if (paso !== "dni") return;
    const el = dniRef.current;
    if (!el) return;

    const sync = () => {
      const limpio = soloDigitos(el.value);
      if (el.value !== limpio) el.value = limpio;
      setDni(limpio);
      setDniListo(limpio.length >= 7);
    };

    el.addEventListener("input", sync);
    el.addEventListener("keyup", sync);
    el.addEventListener("change", sync);
    // Teclado virtual Silk a veces solo dispara esto al soltar
    el.addEventListener("blur", sync);
    sync();
    return () => {
      el.removeEventListener("input", sync);
      el.removeEventListener("keyup", sync);
      el.removeEventListener("change", sync);
      el.removeEventListener("blur", sync);
    };
  }, [paso]);

  function reiniciarSesion() {
    setPaso("dni");
    setDni("");
    setDniListo(false);
    setCliente(null);
    setError("");
    setTurno(null);
    setCargando(null);
  }

  async function buscarDni(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Fuente de verdad: valor real del input (Silk no siempre sincroniza state)
    const limpio = soloDigitos(dniRef.current?.value ?? dni);
    setDni(limpio);
    setDniListo(limpio.length >= 7);

    if (limpio.length < 7) {
      setError("Ingrese un DNI válido (al menos 7 dígitos)");
      return;
    }

    setCargandoLogin(true);
    setError("");

    try {
      const respuesta = await fetch(
        `/api/turnero/clientes?dni=${encodeURIComponent(limpio)}`,
        { cache: "no-store" },
      );
      const data = await respuesta.json();

      if (respuesta.status === 404 && data.requiereNombre !== false) {
        setPaso("nombre");
        return;
      }

      if (!respuesta.ok) {
        throw new Error(data.error ?? "No se pudo validar el DNI");
      }

      setCliente(data.cliente as ClienteDTO);
      setPaso("categorias");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setCargandoLogin(false);
    }
  }

  async function registrarNombre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const limpioDni = soloDigitos(dniRef.current?.value ?? dni);
    const nombre = (nombreRef.current?.value ?? "").trim().replace(/\s+/g, " ");

    if (nombre.length < 2) {
      setError("Ingrese nombre y apellido");
      return;
    }

    setCargandoLogin(true);
    setError("");

    try {
      const respuesta = await fetch("/api/turnero/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni: limpioDni, nombre }),
      });
      const data = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(data.error ?? "No se pudo registrar");
      }

      setCliente(data.cliente as ClienteDTO);
      setPaso("categorias");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setCargandoLogin(false);
    }
  }

  async function emitir(categoria: Categoria) {
    if (cargando || !cliente) return;
    setCargando(categoria);
    setError("");
    setTurno(null);

    try {
      const respuesta = await fetch("/api/turnero/turnos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria, clienteId: cliente.id }),
      });
      const data = await respuesta.json();
      if (!respuesta.ok) throw new Error(data.error ?? "No se pudo emitir el turno");

      const nuevoTurno = data as TurnoDTO;
      setTurno(nuevoTurno);
      setCargando(null);
      window.setTimeout(() => reiniciarSesion(), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
      setCargando(null);
    }
  }

  return (
    <main className="min-h-dvh px-5 py-8 sm:px-10 sm:py-12">
      {paso === "dni" && (
        <section className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center">
          <Logo />
          <h1 className="text-center text-4xl font-bold text-white sm:text-5xl">
            Bienvenido
          </h1>
          <p className="mt-4 text-center text-xl text-white/50">
            Ingrese su DNI para continuar
          </p>
          <form onSubmit={buscarDni} className="mt-10 space-y-5" noValidate>
            <label className="block">
              <span className="mb-2 block text-sm font-bold uppercase tracking-[.2em] text-[var(--turnero-accent)]">
                DNI
              </span>
              {/* Uncontrolled: Silk rompe inputs controlados de React (value+onChange) */}
              <input
                ref={dniRef}
                name="dni"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                defaultValue=""
                placeholder="Ej: 30123456"
                className="w-full rounded-2xl border-2 border-white/10 bg-[var(--turnero-surface)] px-6 py-5 text-center text-3xl font-extrabold tracking-widest text-white outline-none transition focus:border-[var(--turnero-accent)]"
              />
            </label>
            <button
              type="submit"
              disabled={cargandoLogin}
              className="w-full rounded-2xl bg-[var(--turnero-accent)] text-[var(--turnero-accent-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-white/50"
            >
              {cargandoLogin ? "Validando…" : "Continuar"}
            </button>
            <p className="text-center text-sm text-white/50">
              {dniListo
                ? "Listo — tocá Continuar"
                : "Escribí al menos 7 números del DNI y tocá Continuar"}
            </p>
          </form>
        </section>
      )}

      {paso === "nombre" && (
        <section className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center">
          <Logo />
          <h1 className="text-center text-4xl font-bold text-white sm:text-5xl">
            Primer ingreso
          </h1>
          <p className="mt-4 text-center text-xl text-white/50">
            DNI <span className="font-bold text-[var(--turnero-accent)]">{dni}</span> no
            registrado. Ingrese su nombre.
          </p>
          <form onSubmit={registrarNombre} className="mt-10 space-y-5" noValidate>
            <label className="block">
              <span className="mb-2 block text-sm font-bold uppercase tracking-[.2em] text-[var(--turnero-accent)]">
                Nombre y apellido
              </span>
              <input
                ref={nombreRef}
                name="nombre"
                type="text"
                autoComplete="name"
                autoFocus
                defaultValue=""
                placeholder="Ej: Juan Pérez"
                className="w-full rounded-2xl border-2 border-white/10 bg-[var(--turnero-surface)] px-6 py-5 text-center text-2xl font-bold text-white outline-none transition focus:border-[var(--turnero-accent)]"
              />
            </label>
            <button
              type="submit"
              disabled={cargandoLogin}
              className="w-full rounded-2xl bg-[var(--turnero-accent)] text-[var(--turnero-accent-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-white/50"
            >
              {cargandoLogin ? "Registrando…" : "Registrarme"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPaso("dni");
                setError("");
              }}
              className="w-full rounded-xl px-4 py-3 font-bold text-white/50 hover:text-[var(--turnero-accent)]"
            >
              Volver
            </button>
          </form>
        </section>
      )}

      {paso === "categorias" && cliente && (
        <>
          <header className="mx-auto mb-10 max-w-6xl text-center">
            <Logo />
            <p className="text-sm font-bold uppercase tracking-[.25em] text-[var(--turnero-accent)]">
              Hola, {cliente.nombre}
            </p>
            <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">
              ¿Cómo podemos ayudarle?
            </h1>
            <p className="mt-4 text-xl text-white/50">
              Seleccione una opción para obtener su turno
            </p>
            <button
              type="button"
              onClick={reiniciarSesion}
              className="mt-4 text-sm font-bold text-white/50 underline-offset-4 hover:text-[var(--turnero-accent)] hover:underline"
            >
              Cambiar usuario (DNI {cliente.dni})
            </button>
          </header>

          <section className="mx-auto grid max-w-6xl items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {opciones.map((opcion) => (
              <button
                key={opcion.categoria}
                type="button"
                disabled={cargando !== null}
                onClick={() => emitir(opcion.categoria)}
                className="group flex h-full min-h-[17rem] flex-col items-center rounded-[2rem] border-2 border-white/10 bg-[var(--turnero-surface)] px-5 py-7 text-center shadow-lg transition duration-200 hover:-translate-y-1 hover:border-[var(--turnero-accent)] hover:shadow-lg active:translate-y-0 disabled:cursor-wait disabled:opacity-60 sm:px-6 sm:py-8"
              >
                <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[var(--turnero-accent)] text-4xl font-extrabold text-[var(--turnero-accent-foreground)] transition group-hover:opacity-90">
                  {opcion.icono}
                </span>
                <span className="mt-5 flex min-h-[3.5rem] w-full items-center justify-center whitespace-pre-line text-xl font-extrabold leading-tight tracking-wide text-white sm:min-h-[4rem] sm:text-2xl">
                  {opcion.titulo}
                </span>
                <span className="mt-3 flex min-h-[3rem] w-full items-start justify-center text-center text-base leading-snug text-white/50 sm:min-h-[3.25rem] sm:text-lg">
                  {opcion.descripcion}
                </span>
              </button>
            ))}
          </section>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="mx-auto mt-8 max-w-xl rounded-xl bg-red-950/80 p-4 text-center font-bold text-red-300"
        >
          {error}
        </p>
      )}

      {(cargando || turno) && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[var(--turnero-surface)] p-10 text-center shadow-2xl">
            {turno ? (
              <>
                <p className="text-sm font-extrabold uppercase tracking-[.25em] text-[var(--turnero-accent)]">
                  Turno registrado
                </p>
                <p className="mt-4 text-xl font-bold text-white/50">
                  {ETIQUETAS_CATEGORIA[turno.categoria] ?? turno.categoria}
                </p>
                <p className="my-5 break-words text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                  {turno.codigo}
                </p>
                <p className="text-lg text-white/65">
                  Aguarde a ser llamado por su nombre
                </p>
                <p className="mt-4 text-sm text-white/50">
                  Esta pantalla se cerrará automáticamente…
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-6 h-14 w-14 animate-spin rounded-full border-4 border-white/10 border-t-[var(--turnero-accent)]" />
                <p className="text-2xl font-extrabold text-white">Generando turno…</p>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
