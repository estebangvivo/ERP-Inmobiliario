import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BRAND_NAME, BRAND_SLOGAN } from "@/lib/brand";

export default function StorefrontLayout({
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
            <Link
              href="/propiedades"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Propiedades
            </Link>
            <Link href="/login">
              <Button size="sm">Ingresar</Button>
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mt-16 border-t border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-[var(--muted-foreground)] sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND_NAME}
          </p>
          <p>{BRAND_SLOGAN}</p>
        </div>
      </footer>
    </div>
  );
}
