"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StorefrontMobileNav({
  homeHref,
  propertiesHref,
  loginHref,
}: {
  homeHref: string;
  propertiesHref: string;
  loginHref: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative sm:hidden">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-expanded={open}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-md border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm">
          <nav className="flex flex-col gap-3 text-sm">
            <Link
              href={homeHref}
              className="text-[var(--foreground)]"
              onClick={() => setOpen(false)}
            >
              Inicio
            </Link>
            <Link
              href={propertiesHref}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              onClick={() => setOpen(false)}
            >
              Propiedades
            </Link>
            <Link href={loginHref} onClick={() => setOpen(false)}>
              <Button size="sm" className="w-full">
                Ingresar
              </Button>
            </Link>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
