"use client";

import { TurneroLogo } from "@/features/turnero/components/turnero-brand";

const vistas = [
  { href: "/turnero/totem", titulo: "Tótem", texto: "Emitir turnos por nombre" },
  {
    href: "/turnero/pantalla",
    titulo: "Pantalla",
    texto: "Monitor de sala de espera",
  },
  {
    href: "/turnero/operador",
    titulo: "Operador",
    texto: "Atender la cola de turnos",
  },
];

export default function TurneroInicio() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <section className="w-full max-w-5xl">
        <div className="mb-10 flex justify-center">
          <TurneroLogo
            sizeClass="size-24 sm:size-28"
            showName
            nameClassName="mt-4 text-xl font-bold text-white"
          />
        </div>
        <h1 className="mb-3 text-center text-4xl font-bold text-white sm:text-5xl">
          Sistema de turnos
        </h1>
        <p className="mb-10 text-center text-lg text-white/50">
          Seleccione la vista que desea abrir
        </p>
        <div className="grid gap-5 md:grid-cols-3">
          {vistas.map((vista) => (
            <a
              key={vista.href}
              href={vista.href}
              className="rounded-3xl border border-[var(--turnero-border)] bg-[var(--turnero-surface)] p-8 text-white shadow-xl transition hover:-translate-y-1 hover:border-[var(--turnero-accent)] hover:bg-[var(--turnero-elevated)]"
            >
              <span className="block text-3xl font-bold text-[var(--turnero-accent)]">
                {vista.titulo}
              </span>
              <span className="mt-3 block text-white/50">{vista.texto}</span>
            </a>
          ))}
        </div>
        <div className="mt-10 text-center">
          <a
            href="/dashboard"
            className="text-sm font-bold text-white/50 underline-offset-4 hover:text-[var(--turnero-accent)] hover:underline"
          >
            Volver al ERP
          </a>
        </div>
      </section>
    </main>
  );
}
