"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createFeatureRequest } from "@/features/feature-requests/actions/feature-request-actions";

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-accent focus:ring-2";

const fileInputClass =
  "block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-foreground";

type CreateFeatureRequestButtonProps = {
  variant?: "primary" | "secondary";
  label?: string;
};

export function CreateFeatureRequestButton({
  variant = "primary",
  label = "Nueva solicitud",
}: CreateFeatureRequestButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [fileHint, setFileHint] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    setFileHint(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createFeatureRequest(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      if (result.id) {
        router.push(`/solicitudes/${result.id}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={
          variant === "primary"
            ? "inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
            : "inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-elevated"
        }
      >
        <Plus className="size-4" aria-hidden />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-labelledby="create-feature-request-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface-elevated p-5 shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-feature-request-title"
                  className="font-display text-lg tracking-tight"
                >
                  Nueva solicitud
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Contá qué cambio o mejora necesitás. Podés adjuntar capturas o
                  videos.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Título</span>
                <input
                  name="title"
                  required
                  autoFocus
                  className={fieldClass}
                  placeholder="Ej. Exportar certificaciones a Excel"
                  maxLength={120}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">
                  Descripción
                </span>
                <textarea
                  name="description"
                  required
                  className={`${fieldClass} min-h-36`}
                  placeholder="Qué necesitás, en qué módulo, y por qué ayuda."
                  maxLength={5000}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">
                  Imágenes o videos
                </span>
                <input
                  type="file"
                  name="media"
                  accept="image/*,video/*"
                  multiple
                  className={fileInputClass}
                  onChange={(e) => {
                    const n = e.target.files?.length ?? 0;
                    setFileHint(
                      n > 0
                        ? `${n} archivo${n === 1 ? "" : "s"} seleccionado${n === 1 ? "" : "s"}`
                        : null,
                    );
                  }}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Hasta 8 archivos · máx. 50 MB c/u · PNG, JPG, WEBP, GIF, MP4,
                  WEBM, MOV
                  {fileHint ? ` · ${fileHint}` : ""}
                </span>
              </label>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
                >
                  {pending ? "Enviando…" : "Enviar solicitud"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
