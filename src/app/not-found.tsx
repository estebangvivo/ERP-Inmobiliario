import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        No encontramos esa página
      </h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        La propiedad o ruta que buscás no existe o ya no está publicada.
      </p>
      <div className="flex gap-2">
        <Link href="/">
          <Button>Inicio</Button>
        </Link>
        <Link href="/login">
          <Button variant="outline">Ingresar</Button>
        </Link>
      </div>
    </div>
  );
}
