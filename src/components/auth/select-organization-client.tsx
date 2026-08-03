"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  switchOrganization,
  type MyOrganization,
} from "@/features/auth/actions/organization-actions";

type Props = {
  organizations: MyOrganization[];
  required?: boolean;
};

export function SelectOrganizationClient({
  organizations,
  required,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function select(orgId: string) {
    setError(null);
    startTransition(async () => {
      const result = await switchOrganization(orgId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-lg border-[var(--border)] shadow-lg">
      <CardHeader>
        <CardTitle>Elegí una empresa</CardTitle>
        <CardDescription>
          {required
            ? "Tenés acceso a varias inmobiliarias. Seleccioná con cuál trabajar."
            : "Cambiá la empresa activa de tu sesión."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {organizations.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No tenés empresas asignadas.{" "}
            <a href="/onboarding/planes" className="text-[var(--primary)] underline">
              Contratá un plan
            </a>
            .
          </p>
        ) : (
          organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              disabled={pending}
              onClick={() => select(org.id)}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3 text-left transition hover:border-[var(--ring)] hover:bg-[var(--muted)]/40 disabled:opacity-60"
            >
              <div>
                <p className="font-medium">{org.name}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {org.slug} · {org.role}
                </p>
              </div>
              {org.isActive ? (
                <Badge variant="success">Activa</Badge>
              ) : (
                <span className="text-sm text-[var(--primary)]">Entrar →</span>
              )}
            </button>
          ))
        )}
        {error && (
          <p className="text-sm text-[var(--destructive)]">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
