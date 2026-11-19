import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  BRAND_NAME,
  BRAND_PRIVACY_PATH,
  BRAND_SLOGAN,
  BRAND_TERMS_PATH,
} from "@/lib/brand";

/** Header/footer genérico de la marca (home y rutas legacy). */
export function BrandStorefrontChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-[var(--primary)]"
          >
            {BRAND_NAME}
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button size="sm">Ingresar</Button>
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mt-16 border-t border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p>
              © {new Date().getFullYear()} {BRAND_NAME}
            </p>
            <p>{BRAND_SLOGAN}</p>
          </div>
          <nav className="flex flex-wrap gap-4">
            <Link href={BRAND_PRIVACY_PATH} className="hover:underline">
              Política de privacidad
            </Link>
            <Link href={BRAND_TERMS_PATH} className="hover:underline">
              Condiciones del servicio
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
