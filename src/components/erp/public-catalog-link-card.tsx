"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicPropertiesPath, publicStorefrontPath } from "@/lib/public-org";

type Props = {
  orgSlug: string;
  orgName: string;
  appOrigin?: string;
};

export function PublicCatalogLinkCard({
  orgSlug,
  orgName,
  appOrigin = "",
}: Props) {
  const [copied, setCopied] = useState(false);
  const catalogPath = publicPropertiesPath(orgSlug);
  const homePath = publicStorefrontPath(orgSlug);
  const catalogUrl = appOrigin ? `${appOrigin}${catalogPath}` : catalogPath;

  async function copy() {
    const absolute =
      typeof window !== "undefined"
        ? `${window.location.origin}${catalogPath}`
        : catalogUrl;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="text-base font-semibold">Link público de propiedades</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Compartí este enlace con clientes. Solo verán las propiedades publicadas
        de {orgName}.
      </p>
      <p className="mt-3 break-all rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm">
        {catalogUrl}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={copy}>
          {copied ? (
            <>
              <Check className="mr-1.5 h-4 w-4" /> Copiado
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-4 w-4" /> Copiar link
            </>
          )}
        </Button>
        <a href={catalogPath} target="_blank" rel="noreferrer">
          <Button type="button" size="sm" variant="outline">
            <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir catálogo
          </Button>
        </a>
        <a href={homePath} target="_blank" rel="noreferrer">
          <Button type="button" size="sm" variant="ghost">
            Portal
          </Button>
        </a>
      </div>
    </section>
  );
}
