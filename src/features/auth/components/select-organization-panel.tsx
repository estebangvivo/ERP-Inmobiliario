"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  switchOrganization,
  clearActiveOrganization,
  createOrganization,
  type MyOrganization,
} from "@/features/auth/actions/organization-actions";
import { useState } from "react";
import { Input } from "@/components/ui/input";

type Props = {
  organizations: MyOrganization[];
  isPlatformSuperadmin?: boolean;
  requireChoice?: boolean;
};

export function SelectOrganizationPanel({
  organizations,
  isPlatformSuperadmin,
  requireChoice,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function enter(id: string) {
    startTransition(async () => {
      try {
        const result = await switchOrganization(id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.location.assign("/dashboard");
      } catch (err) {
        console.error(err);
        setError("No se pudo abrir la empresa. Probá de nuevo.");
      }
    });
  }

  function toAdmin() {
    startTransition(async () => {
      try {
        await clearActiveOrganization();
        window.location.assign("/admin");
      } catch (err) {
        console.error(err);
        setError("No se pudo volver al panel de plataforma.");
      }
    });
  }

  function create() {
    startTransition(async () => {
      try {
        const result = await createOrganization({ name });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.location.assign("/dashboard");
      } catch (err) {
        console.error(err);
        setError("No se pudo crear la empresa.");
      }
    });
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Elegí una empresa</CardTitle>
        <CardDescription>
          {requireChoice
            ? "Tenés acceso a más de una inmobiliaria."
            : "Seleccioná la empresa con la que querés trabajar."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {organizations.map((org) => (
          <Button
            key={org.id}
            variant={org.isActive ? "default" : "outline"}
            className="w-full justify-between"
            disabled={pending}
            onClick={() => enter(org.id)}
          >
            <span>{org.name}</span>
            <span className="text-xs opacity-70">{org.role}</span>
          </Button>
        ))}

        {isPlatformSuperadmin && (
          <Button
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={toAdmin}
          >
            Ir al panel de plataforma
          </Button>
        )}

        {isPlatformSuperadmin && (
          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <p className="text-sm font-medium">Crear empresa (EXEMPT)</p>
            <div className="flex gap-2">
              <Input
                placeholder="Nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button disabled={pending || !name.trim()} onClick={create}>
                Crear
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-[var(--destructive)]">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
