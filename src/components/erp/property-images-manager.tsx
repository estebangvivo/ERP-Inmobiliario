"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  deletePropertyImageAction,
  setCoverPropertyImageAction,
  uploadPropertyImagesAction,
} from "@/server/actions/property-images";
import { propertyImageSrc } from "@/lib/property-image";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

function GalleryThumb({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-[var(--muted)] px-3 text-center text-xs text-[var(--muted-foreground)]">
        No se puede mostrar. Eliminala y volvé a subirla.
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="aspect-[4/3] w-full bg-[var(--muted)] object-cover"
      onError={() => setBroken(true)}
    />
  );
}

type ImageItem = {
  id: string;
  url: string;
  alt: string | null;
  isCover: boolean;
  sortOrder: number;
};

export function PropertyImagesManager({
  propertyId,
  images,
}: {
  propertyId: string;
  images: ImageItem[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(uploadPropertyImagesAction, initial);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [state, router]);

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div>
        <h3 className="text-lg font-semibold">Galería de fotos</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Subí JPG, PNG o WebP (máx. 8MB c/u). La primera queda como portada.
          Las fotos se guardan en la base (no en el disco del servidor).
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="propertyId" value={propertyId} />
        <div className="space-y-2">
          <Label htmlFor="files">Seleccionar imágenes</Label>
          <input
            ref={inputRef}
            id="files"
            name="files"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--primary)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--primary-foreground)]"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Subiendo…" : "Subir fotos"}
        </Button>
        {state?.ok && state.message ? (
          <p className="text-sm text-emerald-700">{state.message}</p>
        ) : null}
        {state && !state.ok ? (
          <p className="text-sm text-[var(--destructive)]">{state.error}</p>
        ) : null}
      </form>

      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
          Todavía no hay fotos. Subí al menos una para el portal público.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <div
              key={img.id}
              className="overflow-hidden rounded-lg border border-[var(--border)]"
            >
              <GalleryThumb src={propertyImageSrc(img)} alt={img.alt ?? ""} />
              <div className="flex flex-wrap items-center gap-2 p-2">
                {img.isCover ? (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    Portada
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      start(() => {
                        void setCoverPropertyImageAction(img.id).then(() =>
                          router.refresh(),
                        );
                      })
                    }
                  >
                    Hacer portada
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    start(() => {
                      void deletePropertyImageAction(img.id).then(() =>
                        router.refresh(),
                      );
                    })
                  }
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
