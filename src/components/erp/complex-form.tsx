"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createComplexAction,
  updateComplexAction,
} from "@/server/actions/complexes";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

type ComplexFormProps =
  | { mode: "create" }
  | {
      mode: "edit";
      complex: {
        id: string;
        name: string;
        address: string;
        city: string;
        province: string | null;
        description: string | null;
      };
    };

export function ComplexForm(props: ComplexFormProps) {
  const router = useRouter();
  const action = props.mode === "create" ? createComplexAction : updateComplexAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const c = props.mode === "edit" ? props.complex : null;

  useEffect(() => {
    if (state?.ok) {
      router.push("/complejos");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" defaultValue={c?.name} required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="address">Dirección</Label>
          <Input id="address" name="address" defaultValue={c?.address} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Ciudad</Label>
          <Input id="city" name="city" defaultValue={c?.city} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="province">Provincia</Label>
          <Input id="province" name="province" defaultValue={c?.province ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea id="description" name="description" defaultValue={c?.description ?? ""} />
        </div>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : props.mode === "create" ? "Crear edificio" : "Guardar"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/complejos")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
