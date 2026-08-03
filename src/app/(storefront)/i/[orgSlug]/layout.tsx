import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  getPublicOrganization,
  publicPropertiesPath,
  publicStorefrontPath,
} from "@/lib/public-org";
import { BRAND_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

type Params = Promise<{ orgSlug: string }>;

export default async function TenantStorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { orgSlug } = await params;
  const org = await getPublicOrganization(orgSlug);
  if (!org) notFound();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex min-w-0 flex-col">
            <Link
              href={publicStorefrontPath(org.slug)}
              className="truncate text-lg font-semibold tracking-tight text-[var(--primary)]"
            >
              {org.name}
            </Link>
            <span className="text-xs text-[var(--muted-foreground)]">
              Portal · {BRAND_NAME}
            </span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href={publicPropertiesPath(org.slug)}
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
            © {new Date().getFullYear()} {org.name}
          </p>
          <p>
            Potenciado por {BRAND_NAME}
          </p>
        </div>
      </footer>
    </div>
  );
}
