"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErpError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("erp error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
      <h2 className="text-xl font-semibold">No se pudo cargar esta pantalla</h2>
      <p className="text-sm text-[var(--muted-foreground)]">
        Probá de nuevo. Si sigue fallando, volvé al dashboard o recargá la
        página.
      </p>
      <div className="flex justify-center gap-2">
        <Button type="button" onClick={() => reset()}>
          Reintentar
        </Button>
        <Button type="button" variant="outline" onClick={() => {
          window.location.assign("/dashboard");
        }}>
          Ir al inicio
        </Button>
      </div>
    </div>
  );
}
