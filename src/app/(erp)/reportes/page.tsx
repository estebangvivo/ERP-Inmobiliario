import Link from "next/link";
import { FileBarChart, Landmark, Wrench, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/erp/page-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModule, requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    href: "/reportes/flujo",
    title: "Flujo e pendientes",
    description:
      "Ingresos y egresos entre fechas, más saldos a cobrar (inquilinos) y a pagar (liquidaciones y proveedores).",
    icon: Landmark,
  },
  {
    href: "/reportes/gastos-recuperables",
    title: "Gastos a recuperar",
    description:
      "Facturas y órdenes de trabajo con cargo recuperable por la inmobiliaria.",
    icon: Wrench,
  },
  {
    href: "/reportes/morosidad",
    title: "Morosidad",
    description:
      "Inquilinos con deuda abierta y aging (0–30, 31–60, 61–90, +90 días).",
    icon: AlertTriangle,
  },
] as const;

export default async function ReportesIndexPage() {
  await requireModule("reportes");
  await requireStaff();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Informes operativos de caja, recuperables y morosidad."
        actions={
          <span className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <FileBarChart className="h-4 w-4" />
            {REPORTS.length} informes
          </span>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link key={r.href} href={r.href} className="group block">
              <Card className="h-full transition group-hover:border-[var(--primary)]">
                <CardHeader className="space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--muted)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{r.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {r.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
