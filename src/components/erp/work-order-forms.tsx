"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WorkOrderStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PartyPersonSearchSelect } from "@/components/erp/party-person-search-select";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/labels";
import {
  createSupplierInvoiceAction,
  createWorkOrderAction,
  paySupplierInvoiceAction,
  updateWorkOrderStatusAction,
} from "@/server/actions/work-orders";
import type { DocActionResult } from "@/server/actions/billing";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;
const payInitial: DocActionResult | null = null;

export function WorkOrderForm({
  properties,
  suppliers,
  portalMode = false,
}: {
  properties: { id: string; title: string }[];
  suppliers: { id: string; name: string; documentNumber?: string | null; email?: string | null }[];
  portalMode?: boolean;
}) {
  const router = useRouter();
  const [assigneeId, setAssigneeId] = useState("");
  const [state, formAction, pending] = useActionState(createWorkOrderAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          name="title"
          required
          placeholder={
            portalMode ? "Perdida de agua en el baño" : "Reparación de cañería"
          }
        />
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
      {portalMode ? null : (
        <>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="assigneeId">Proveedor</Label>
            <PartyPersonSearchSelect
              kind="SUPPLIER"
              name="assigneeId"
              id="assigneeId"
              value={assigneeId}
              onChange={(value) => setAssigneeId(value)}
              options={suppliers}
              emptyLabel="Sin asignar"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="costBearer">Cargo</Label>
            <Select id="costBearer" name="costBearer" defaultValue="OWNER_DEDUCTIBLE">
              <option value="OWNER_DEDUCTIBLE">Deducible propietario</option>
              <option value="TENANT">Inquilino</option>
              <option value="AGENCY">Agencia</option>
            </Select>
          </div>
        </>
      )}
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="description">Detalle</Label>
        <Textarea id="description" name="description" />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Enviando…"
            : portalMode
              ? "Enviar reclamo"
              : "Crear orden de trabajo"}
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
  suppliers: { id: string; name: string; documentNumber?: string | null; email?: string | null }[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [state, formAction, pending] = useActionState(createSupplierInvoiceAction, initial);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="supplierId">Proveedor</Label>
        <PartyPersonSearchSelect
          kind="SUPPLIER"
          name="supplierId"
          id="supplierId"
          value={supplierId}
          onChange={(value) => setSupplierId(value)}
          options={suppliers}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="amount">Monto</Label>
        <Input id="amount" name="amount" type="number" step="0.01" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoiceDate">Fecha factura</Label>
        <DateInput id="invoiceDate" name="invoiceDate" required />
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

export function PaySupplierInvoiceForm({
  invoiceId,
  amountLabel,
  currency,
  bankAccounts = [],
}: {
  invoiceId: string;
  amountLabel: string;
  currency: string;
  bankAccounts?: { id: string; label: string; currency: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    paySupplierInvoiceAction,
    payInitial,
  );
  const [method, setMethod] = useState("BANK_TRANSFER");

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      if (state.printUrl) {
        window.open(state.printUrl, "_blank", "noopener,noreferrer");
      }
    }
  }, [state, router]);

  const banksForCurrency = bankAccounts.filter(
    (b) => b.currency.toUpperCase() === currency.toUpperCase(),
  );

  return (
    <form
      action={formAction}
      className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="space-y-1">
        <Label className="text-xs">Medio</Label>
        <Select
          name="method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="BANK_TRANSFER">Transferencia</option>
          <option value="CASH">Efectivo</option>
          <option value="OTHER">Otro</option>
        </Select>
      </div>
      {method === "BANK_TRANSFER" ? (
        <div className="min-w-[180px] space-y-1">
          <Label className="text-xs">Cuenta</Label>
          <Select name="bankAccountId" required>
            <option value="">Elegí…</option>
            {banksForCurrency.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label className="text-xs">Ref.</Label>
        <Input name="reference" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "…" : `Pagar ${amountLabel}`}
      </Button>
      {state && !state.ok ? (
        <p className="w-full text-xs text-[var(--destructive)]">{state.error}</p>
      ) : null}
      {state?.ok && state.printUrl ? (
        <a
          href={state.printUrl}
          target="_blank"
          rel="noreferrer"
          className="w-full text-xs text-emerald-700 underline"
        >
          Abrir OP para imprimir / WhatsApp
        </a>
      ) : null}
    </form>
  );
}
