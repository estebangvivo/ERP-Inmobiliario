"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SaleDealStage } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SALE_DEAL_STAGE_LABELS } from "@/lib/labels";
import {
  createSaleDealAction,
  updateSaleDealAction,
  updateSaleDealStageAction,
} from "@/server/actions/sales";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;
const STAGES = Object.keys(SALE_DEAL_STAGE_LABELS) as SaleDealStage[];

export function CreateSaleDealForm({
  properties,
  defaultPropertyId,
}: {
  properties: { id: string; title: string }[];
  defaultPropertyId?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createSaleDealAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2"
    >
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="propertyId">Propiedad</Label>
        <Select
          id="propertyId"
          name="propertyId"
          required
          defaultValue={defaultPropertyId ?? ""}
        >
          <option value="" disabled>
            Seleccionar…
          </option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="buyerName">Comprador</Label>
        <Input id="buyerName" name="buyerName" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="stage">Etapa</Label>
        <Select id="stage" name="stage" defaultValue="LEAD">
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {SALE_DEAL_STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="buyerEmail">Email</Label>
        <Input id="buyerEmail" name="buyerEmail" type="email" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="buyerPhone">Teléfono</Label>
        <Input id="buyerPhone" name="buyerPhone" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="offerAmount">Oferta</Label>
        <Input id="offerAmount" name="offerAmount" type="number" step="0.01" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="reservationAmount">Seña</Label>
        <Input
          id="reservationAmount"
          name="reservationAmount"
          type="number"
          step="0.01"
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending || properties.length === 0}>
          {pending ? "Creando…" : "Crear oportunidad"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-2">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function SaleDealEditForm({
  deal,
}: {
  deal: {
    id: string;
    buyerName: string;
    buyerEmail: string | null;
    buyerPhone: string | null;
    stage: SaleDealStage;
    offerAmount: string | null;
    reservationAmount: string | null;
    notes: string | null;
  };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateSaleDealAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={deal.id} />
      <div className="space-y-1">
        <Label htmlFor="buyerName">Comprador</Label>
        <Input
          id="buyerName"
          name="buyerName"
          defaultValue={deal.buyerName}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="stage">Etapa</Label>
        <Select id="stage" name="stage" defaultValue={deal.stage}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {SALE_DEAL_STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="buyerEmail">Email</Label>
        <Input
          id="buyerEmail"
          name="buyerEmail"
          type="email"
          defaultValue={deal.buyerEmail ?? ""}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="buyerPhone">Teléfono</Label>
        <Input
          id="buyerPhone"
          name="buyerPhone"
          defaultValue={deal.buyerPhone ?? ""}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="offerAmount">Oferta</Label>
        <Input
          id="offerAmount"
          name="offerAmount"
          type="number"
          step="0.01"
          defaultValue={deal.offerAmount ?? ""}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="reservationAmount">Seña</Label>
        <Input
          id="reservationAmount"
          name="reservationAmount"
          type="number"
          step="0.01"
          defaultValue={deal.reservationAmount ?? ""}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" defaultValue={deal.notes ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-2">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function SaleStageButtons({
  dealId,
  current,
}: {
  dealId: string;
  current: SaleDealStage;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {STAGES.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === current ? "default" : "outline"}
          disabled={pending || s === current}
          onClick={() =>
            start(async () => {
              await updateSaleDealStageAction(dealId, s);
              router.refresh();
            })
          }
        >
          {SALE_DEAL_STAGE_LABELS[s]}
        </Button>
      ))}
    </div>
  );
}
