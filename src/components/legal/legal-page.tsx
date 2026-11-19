import Link from "next/link";
import type { ReactNode } from "react";
import { BrandStorefrontChrome } from "@/components/storefront/brand-storefront-chrome";
import {
  BRAND_LEGAL_NAME,
  BRAND_NAME,
  BRAND_PRIVACY_PATH,
  BRAND_TERMS_PATH,
} from "@/lib/brand";

export function LegalPageShell({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <BrandStorefrontChrome>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-[var(--muted-foreground)]">
          <Link href="/" className="hover:underline">
            {BRAND_NAME}
          </Link>
          {" · "}
          <Link href={BRAND_PRIVACY_PATH} className="hover:underline">
            Privacidad
          </Link>
          {" · "}
          <Link href={BRAND_TERMS_PATH} className="hover:underline">
            Condiciones
          </Link>
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          {BRAND_LEGAL_NAME} · Última actualización: {updatedAt}
        </p>
        <article className="prose-legal mt-10 space-y-8 text-[15px] leading-7 text-[var(--foreground)]">
          {children}
        </article>
      </main>
    </BrandStorefrontChrome>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[var(--muted-foreground)] [&_strong]:text-[var(--foreground)] [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
