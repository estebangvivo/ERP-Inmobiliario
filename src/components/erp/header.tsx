"use client";

import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutLocal } from "@/features/auth/actions/auth-actions";

function titleFromPath(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const map: Record<string, string> = {
    dashboard: "Dashboard",
    gestion: "Gestión",
    propiedades: "Propiedades",
    complejos: "Edificios",
    contratos: "Contratos",
    cobros: "Cobros",
    "cuenta-corriente": "Cuenta corriente",
    tesoreria: "Tesorería",
    expensas: "Expensas",
    mantenimiento: "Mantenimiento",
    rendiciones: "Rendiciones",
    usuarios: "Usuarios",
    leads: "Consultas",
    visitas: "Visitas",
    agenda: "Agenda",
    ventas: "Ventas",
    turnero: "Turnero",
    ajustes: "Ajustes",
    manual: "Manual",
    admin: "Plataforma",
  };
  return map[segment] ?? segment;
}

function breadcrumbs(pathname: string): string[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return ["ERP", "Dashboard"];
  return ["ERP", ...parts.map((p) => titleFromPath(`/${p}`))];
}

type ErpHeaderProps = {
  menuOpen?: boolean;
  onMenuToggle?: () => void;
};

export function ErpHeader({ menuOpen = false, onMenuToggle }: ErpHeaderProps) {
  const pathname = usePathname();
  const crumbs = breadcrumbs(pathname);
  const title = titleFromPath(pathname);

  async function handleLogout() {
    await logoutLocal();
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {onMenuToggle ? (
          <button
            type="button"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)] md:hidden"
            onClick={onMenuToggle}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        ) : null}
        <div className="min-w-0">
          <nav className="mb-0.5 hidden items-center gap-1 text-xs text-[var(--muted-foreground)] sm:flex">
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
          <h1 className="truncate text-base font-semibold tracking-tight">
            {title}
          </h1>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => void handleLogout()}
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Salir</span>
      </Button>
    </header>
  );
}
