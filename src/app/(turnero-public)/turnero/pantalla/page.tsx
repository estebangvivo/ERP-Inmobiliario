"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prepararAudio, reproducirDingDong } from "@/features/turnero/lib/audio";
import { textoTurnoParaVoz, type TurnoDTO } from "@/features/turnero/lib/turnos";
import {
  TurneroLogo,
  useTurneroBrand,
} from "@/features/turnero/components/turnero-brand";

function ordenarLlamados(turnos: TurnoDTO[]) {
  return turnos
    .filter((turno) => turno.llamadoEn && turno.estado !== "CANCELADO")
    .sort(
      (a, b) =>
        new Date(b.llamadoEn!).getTime() - new Date(a.llamadoEn!).getTime(),
    );
}

export default function PantallaPage() {
  const { name: orgName } = useTurneroBrand();
  const [turnos, setTurnos] = useState<TurnoDTO[]>([]);
  const [hora, setHora] = useState(new Date());
  const [audioActivo, setAudioActivo] = useState(false);
  const [conexionError, setConexionError] = useState(false);
  // undefined = todavía no se hizo la primera consulta; null = consulta sin llamados.
  const ultimaSenal = useRef<string | null | undefined>(undefined);

  const llamados = useMemo(() => ordenarLlamados(turnos), [turnos]);
  const actual = llamados[0] ?? null;
  const historial = llamados.slice(1, 5);

  const anunciar = useCallback(async (turno: TurnoDTO) => {
    try {
      await reproducirDingDong();
    } catch {
      // La voz continúa aunque el navegador no habilite Web Audio.
    }

    window.setTimeout(() => {
      window.speechSynthesis.cancel();
      const mensaje = new SpeechSynthesisUtterance(textoTurnoParaVoz(turno));
      mensaje.lang = "es-AR";
      mensaje.rate = 0.86;
      mensaje.pitch = 1;
      mensaje.volume = 1;
      window.speechSynthesis.speak(mensaje);
    }, 650);
  }, []);

  useEffect(() => {
    let activo = true;

    async function actualizar() {
      try {
        const respuesta = await fetch(`/api/turnero/pantalla?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!respuesta.ok) throw new Error("Error de conexión");
        const data = (await respuesta.json()) as TurnoDTO[];
        if (!activo) return;

        setTurnos(data);
        setConexionError(false);

        const masReciente = ordenarLlamados(data)[0];
        if (masReciente?.llamadoEn) {
          const senal = `${masReciente.id}:${masReciente.llamadoEn}`;
          if (ultimaSenal.current === undefined) {
            ultimaSenal.current = senal;
          } else if (senal !== ultimaSenal.current) {
            ultimaSenal.current = senal;
            if (audioActivo) void anunciar(masReciente);
          }
        } else if (ultimaSenal.current === undefined) {
          ultimaSenal.current = null;
        }
      } catch {
        if (activo) setConexionError(true);
      }
    }

    void actualizar();
    const intervalo = window.setInterval(actualizar, 750);
    return () => {
      activo = false;
      window.clearInterval(intervalo);
    };
  }, [anunciar, audioActivo]);

  useEffect(() => {
    const reloj = window.setInterval(() => setHora(new Date()), 1000);
    return () => window.clearInterval(reloj);
  }, []);

  async function activarAudio() {
    try {
      await prepararAudio();
      setAudioActivo(true);
    } catch {
      setAudioActivo(true);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col overflow-hidden bg-[var(--turnero-bg)] text-white">
      <header className="flex items-center justify-between border-b border-[var(--turnero-border)] bg-[var(--turnero-surface)] px-6 py-4 sm:px-10">
        <div className="flex items-center gap-4">
          <TurneroLogo sizeClass="size-14 sm:size-16" />
          <div>
            <p className="text-xl font-bold tracking-wide text-white sm:text-2xl">
              {orgName}
            </p>
            <p className="text-xs font-bold uppercase tracking-[.28em] text-[var(--turnero-accent)]">
              Turnos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {conexionError && (
            <span className="rounded-full bg-red-500/20 px-3 py-1 text-sm font-bold text-red-300">
              Reconectando…
            </span>
          )}
          {!audioActivo && (
            <button
              type="button"
              onClick={activarAudio}
              className="rounded-xl bg-[var(--turnero-accent)] text-[var(--turnero-accent-foreground)] shadow-lg hover:opacity-90"
            >
              Activar audio
            </button>
          )}
          <time className="min-w-32 text-right text-xl font-bold text-white/80 sm:text-3xl">
            {hora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
          </time>
        </div>
      </header>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,.75fr)]">
        <section className="flex min-h-[58vh] items-center justify-center p-6 sm:p-10">
          {actual ? (
            <div
              key={`${actual.id}:${actual.llamadoEn}`}
              className="w-full animate-pulse text-center"
            >
              <p className="text-2xl font-bold uppercase tracking-[.22em] text-white/50 sm:text-4xl">
                Turno
              </p>
              <p className="my-5 break-words px-2 text-[clamp(2.25rem,6.5vw,5.5rem)] font-extrabold leading-tight tracking-tight text-white">
                {actual.codigo}
              </p>
              <div className="mx-auto max-w-4xl rounded-3xl bg-[var(--turnero-accent)] px-6 py-5 text-[var(--turnero-accent-foreground)] shadow-2xl sm:px-10 sm:py-8">
                <p className="text-xl font-bold uppercase tracking-wider sm:text-3xl">Pase a</p>
                <p className="mt-1 text-4xl font-extrabold sm:text-6xl">{actual.puesto}</p>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-8 flex justify-center opacity-90">
                <TurneroLogo sizeClass="size-32 sm:size-40" />
              </div>
              <p className="text-5xl font-bold text-white/80 sm:text-7xl">
                Bienvenidos
              </p>
              <p className="mt-5 text-2xl text-white/50">Aguarde a ser llamado</p>
            </div>
          )}
        </section>

        <aside className="border-t border-[var(--turnero-border)] bg-[var(--turnero-surface)] p-6 sm:p-8 lg:border-l lg:border-t-0">
          <h2 className="mb-6 text-2xl font-extrabold uppercase tracking-wider text-white/50">
            Últimos llamados
          </h2>
          <div className="space-y-4">
            {historial.length ? (
              historial.map((turno) => (
                <div
                  key={`${turno.id}:${turno.llamadoEn}`}
                  className="flex items-center justify-between rounded-2xl border border-[var(--turnero-border)] bg-black/60 p-5"
                >
                  <span className="min-w-0 flex-1 break-words text-xl font-extrabold leading-tight sm:text-2xl">
                    {turno.codigo}
                  </span>
                  <span className="ml-4 text-right text-lg font-bold text-[var(--turnero-accent)] sm:text-xl">
                    {turno.puesto}
                  </span>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-lg text-white/50">
                Aún no hay llamados
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
