"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createLeadAction,
  type LeadActionResult,
} from "@/server/actions/leads";

const initial: LeadActionResult | null = null;

export function LeadForm({
  propertyId,
  propertyTitle,
}: {
  propertyId?: string;
  propertyTitle?: string;
}) {
  const [state, formAction, pending] = useActionState(createLeadAction, initial);

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
        ¡Consulta enviada! Un asesor te contactará a la brevedad.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      {propertyId ? <input type="hidden" name="propertyId" value={propertyId} /> : null}
      <div>
        <h3 className="text-lg font-semibold">Consultar</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          {propertyTitle
            ? `Sobre “${propertyTitle}”`
            : "Dejanos tus datos y te respondemos."}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Mensaje</Label>
        <Textarea
          id="message"
          name="message"
          required
          defaultValue={
            propertyTitle
              ? `Hola, me interesa la propiedad “${propertyTitle}”. ¿Podemos coordinar una visita?`
              : ""
          }
        />
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enviando…" : "Enviar consulta"}
      </Button>
    </form>
  );
}
