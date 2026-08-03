"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WorkOrderStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/labels";
import {
  createSupplierInvoiceAction,
  createWorkOrderAction,
  updateWorkOrderStatusAction,
} from "@/server/actions/work-orders";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

export function WorkOrderForm({
  properties,
  suppliers,
}: {
  properties: { id: string; title: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createWorkOrderAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="title">Título</Label>
        <Input id="title" name="title" required placeholder="Reparación de cañería" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="propertyId">Propiedad</Label>
        <Select id="propertyId" name="propertyId" required defaultValue="">
          <option value="" disabled>Seleccionar…</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="assigneeId">Proveedor</Label>
        <Select id="assigneeId" name="assigneeId" defaultValue="">
          <option value="">Sin asignar</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="costBearer">Cargo</Label>
        <Select id="costBearer" name="costBearer" defaultValue="OWNER_DEDUCTIBLE">
          <option value="OWNER_DEDUCTIBLE">Deducible propietario</option>
          <option value="TENANT">Inquilino</option>
          <option value="AGENCY">Agencia</option>
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="description">Detalle</Label>
        <Textarea id="description" name="description" />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear orden de trabajo"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-2">{state.error}</p>
      ) : null}
    </form>
  );
}

export function WorkOrderStatusButtons({
  id,
  status,
}: {
  id: string;
  status: WorkOrderStatus;
}) {
  const [pending, start] = useTransition();
  const next: WorkOrderStatus[] =
    status === "OPEN"
      ? ["ASSIGNED", "CANCELLED"]
      : status === "ASSIGNED"
        ? ["IN_PROGRESS", "CANCELLED"]
        : status === "IN_PROGRESS"
          ? ["COMPLETED", "CANCELLED"]
          : [];

  if (next.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {next.map((s) => (
        <Button
          key={s}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => start(() => { void updateWorkOrderStatusAction(id, s); })}
        >
          → {WORK_ORDER_STATUS_LABELS[s]}
        </Button>
      ))}
    </div>
  );
}

export function SupplierInvoiceForm({
  workOrderId,
  suppliers,
}: {
  workOrderId: string;
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createSupplierInvoiceAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <div className="space-y-1">
        <Label htmlFor="supplierId">Proveedor</Label>
        <Select id="supplierId" name="supplierId" required defaultValue="">
          <option value="" disabled>Seleccionar…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="amount">Monto</Label>
        <Input id="amount" name="amount" type="number" step="0.01" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoiceDate">Fecha factura</Label>
        <Input id="invoiceDate" name="invoiceDate" type="date" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoiceNumber">Nº factura</Label>
        <Input id="invoiceNumber" name="invoiceNumber" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="costBearer">Cargo</Label>
        <Select id="costBearer" name="costBearer" defaultValue="OWNER_DEDUCTIBLE">
          <option value="OWNER_DEDUCTIBLE">Deducible propietario</option>
          <option value="TENANT">Inquilino</option>
          <option value="AGENCY">Agencia</option>
        </Select>
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Registrar factura"}
        </Button>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)] sm:col-span-2">{state.error}</p>
      ) : null}
    </form>
  );
}
