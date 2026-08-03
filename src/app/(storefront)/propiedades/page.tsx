import type { Metadata } from "next";
import Link from "next/link";
import { BrandStorefrontChrome } from "@/components/storefront/brand-storefront-chrome";
import { Button } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Catálogo por inmobiliaria | ${BRAND_NAME}`,
  description:
    "Cada inmobiliaria tiene su propio link de propiedades. Pedí el enlace a tu asesor.",
};

export default function PublicPropiedadesPage() {
  return (
    <BrandStorefrontChrome>
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Catálogo por inmobiliaria
        </h1>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          Ya no mezclamos propiedades de distintas empresas. Cada inmobiliaria
          comparte su propio link, por ejemplo{" "}
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs">
            /i/tu-inmobiliaria/propiedades
          </code>
          .
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login">
            <Button>Ingresar al ERP</Button>
          </Link>
          <Link href="/">
            <Button variant="outline">Volver al inicio</Button>
          </Link>
        </div>
      </div>
    </BrandStorefrontChrome>
  );
}
