"use client";

import { ArrowLeft } from "lucide-react";

/**
 * Enlace nativo (no next/link) para Silk / Fire.
 * Barra en el flujo del documento (no fixed) para no tapar el contenido.
 */
export function TurneroBackToApp() {
  return (
    <div className="shrink-0 border-b border-white/10 bg-[var(--turnero-bg)]">
      <a
        href="/dashboard"
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white/50 transition hover:text-[var(--turnero-accent)] sm:px-6"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        Volver al ERP
      </a>
    </div>
  );
}
