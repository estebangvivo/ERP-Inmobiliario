"use client";

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutLocal } from "@/features/auth/actions/auth-actions";

function titleFromPath(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const map: Record<string, string> = {
    dashboard: "Dashboard",
    gestion: "Gestión",
    propiedades: "Propiedades",
    complejos: "Complejos",
    contratos: "Contratos",
    cobros: "Cobros",
    expensas: "Expensas",
    mantenimiento: "Mantenimiento",
    rendiciones: "Rendiciones",
    usuarios: "Usuarios",
    leads: "Consultas",
    admin: "Plataforma",
  };
  return map[segment] ?? segment;
}

function breadcrumbs(pathname: string): string[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return ["ERP", "Dashboard"];
  return ["ERP", ...parts.map((p) => titleFromPath(`/${p}`))];
}

export function ErpHeader() {
  const pathname = usePathname();
  const crumbs = breadcrumbs(pathname);
  const title = titleFromPath(pathname);

  async function handleLogout() {
    await logoutLocal();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-6">
      <div>
        <nav className="mb-0.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
          {crumbs.map((crumb, i) => (
            <span key={`${crumb}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <span
                className={
                  i === crumbs.length - 1 ? "text-[var(--foreground)]" : ""
                }
              >
                {crumb}
              </span>
            </span>
          ))}
        </nav>
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      </div>
      <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
        <LogOut className="h-4 w-4" />
        Salir
      </Button>
    </header>
  );
}
