"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BillStatus,
  ContractServicePaidBy,
  Currency,
  ServiceCostCategory,
} from "@prisma/client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly } from "@/lib/dates";
import { BILL_STATUS_LABELS, SERVICE_COST_CATEGORY_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { CONTRACT_SERVICE_PAID_BY_LABELS } from "@/features/contracts/lib/contract-services";
import {
  addContractServiceAction,
  removeContractServiceAction,
  updateContractServiceAction,
} from "@/server/actions/contract-services";
import type { ActionResult } from "@/server/actions/users";

const initial: ActionResult | null = null;

export type ContractServiceRow = {
  id: string;
  category: ServiceCostCategory;
  concept: string;
  amount: string;
  paidBy: ContractServicePaidBy;
};

export type OpenBillOption = {
  id: string;
  periodYear: number;
  periodMonth: number;
  dueDate: Date | string;
  status: BillStatus;
};

type EditState = {
  service: ContractServiceRow;
  amount: string;
  paidBy: ContractServicePaidBy;
  scope: "REST_OF_CONTRACT" | "SINGLE_BILL";
  fromYear: string;
  fromMonth: string;
  tenantBillId: string;
};

type Props = {
  contractId: string;
  currency: Currency;
  services: ContractServiceRow[];
  openBills: OpenBillOption[];
  contractStartYear: number;
  contractStartMonth: number;
};

export function ContractServicesPanel({
  contractId,
  currency,
  services,
  openBills,
  contractStartYear,
  contractStartMonth,
}: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [addState, addAction, addPending] = useActionState(
    addContractServiceAction,
    initial,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateContractServiceAction,
    initial,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeContractServiceAction,
    initial,
  );

  const defaultBill = openBills[0];

  useEffect(() => {
    if (addState?.ok || updateState?.ok || removeState?.ok) {
      setAddOpen(false);
      setEdit(null);
      router.refresh();
    }
  }, [addState, updateState, removeState, router]);

  function openEdit(service: ContractServiceRow) {
    const bill = defaultBill;
    setEdit({
      service,
      amount: service.amount,
      paidBy: service.paidBy,
      scope: "REST_OF_CONTRACT",
      fromYear: String(bill?.periodYear ?? contractStartYear),
      fromMonth: String(bill?.periodMonth ?? contractStartMonth),
      tenantBillId: bill?.id ?? "",
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Servicios mensuales</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Cobros recurrentes distintos del alquiler. Podés modificarlos después
            (resto del contrato o una cuota puntual).
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAddOpen((v) => !v)}
        >
          <Plus className="mr-1 size-4" />
          Agregar
        </Button>
      </div>

      {services.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Sin servicios cargados en este contrato.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-medium">{s.concept}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {SERVICE_COST_CATEGORY_LABELS[s.category]} · Paga{" "}
                  {CONTRACT_SERVICE_PAID_BY_LABELS[s.paidBy].toLowerCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {formatMoney(s.amount, currency)}
                </span>
                <Badge variant="secondary">/ mes</Badge>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => openEdit(s)}
                  aria-label={`Editar ${s.concept}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <form action={removeAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    disabled={removePending}
                    aria-label={`Quitar ${s.concept}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {addOpen ? (
        <form action={addAction} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
          <input type="hidden" name="contractId" value={contractId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select name="category" defaultValue="OTHER">
                {(
                  Object.keys(
                    SERVICE_COST_CATEGORY_LABELS,
                  ) as ServiceCostCategory[]
                )
                  .filter((c) => c !== "COMMON" && c !== "WORKS")
                  .map((c) => (
                    <option key={c} value={c}>
                      {SERVICE_COST_CATEGORY_LABELS[c]}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Concepto</Label>
              <Input name="concept" placeholder="Ej. Internet" required />
            </div>
            <div className="space-y-1">
              <Label>Monto mensual</Label>
              <Input name="amount" type="number" step="0.01" min="0" required />
            </div>
            <div className="space-y-1">
              <Label>Paga</Label>
              <Select name="paidBy" defaultValue="TENANT">
                {(
                  Object.keys(
                    CONTRACT_SERVICE_PAID_BY_LABELS,
                  ) as ContractServicePaidBy[]
                ).map((k) => (
                  <option key={k} value={k}>
                    {CONTRACT_SERVICE_PAID_BY_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {addState && !addState.ok ? (
            <p className="text-sm text-[var(--destructive)]">{addState.error}</p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={addPending}>
              {addPending ? "Guardando…" : "Guardar servicio"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAddOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <form
            action={updateAction}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg"
          >
            <input type="hidden" name="id" value={edit.service.id} />
            <h3 className="text-lg font-semibold">
              Modificar {edit.service.concept}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Actual: {formatMoney(edit.service.amount, currency)} ·{" "}
              {CONTRACT_SERVICE_PAID_BY_LABELS[edit.service.paidBy]}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nuevo monto</Label>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={edit.amount}
                  onChange={(e) =>
                    setEdit({ ...edit, amount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Paga</Label>
                <Select
                  name="paidBy"
                  value={edit.paidBy}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      paidBy: e.target.value as ContractServicePaidBy,
                    })
                  }
                >
                  {(
                    Object.keys(
                      CONTRACT_SERVICE_PAID_BY_LABELS,
                    ) as ContractServicePaidBy[]
                  ).map((k) => (
                    <option key={k} value={k}>
                      {CONTRACT_SERVICE_PAID_BY_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <fieldset className="mt-4 space-y-2">
              <legend className="text-sm font-medium">¿Desde cuándo aplica?</legend>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3">
                <input
                  type="radio"
                  name="scope"
                  value="REST_OF_CONTRACT"
                  checked={edit.scope === "REST_OF_CONTRACT"}
                  onChange={() =>
                    setEdit({ ...edit, scope: "REST_OF_CONTRACT" })
                  }
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-medium">Resto del contrato</span>
                  <span className="mt-1 block text-[var(--muted-foreground)]">
                    Desde el período indicado en todas las cuotas abiertas.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3">
                <input
                  type="radio"
                  name="scope"
                  value="SINGLE_BILL"
                  checked={edit.scope === "SINGLE_BILL"}
                  onChange={() => setEdit({ ...edit, scope: "SINGLE_BILL" })}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-medium">Solo una cuota de servicios</span>
                  <span className="mt-1 block text-[var(--muted-foreground)]">
                    Afecta únicamente el documento de servicios del mes elegido.
                  </span>
                </span>
              </label>
            </fieldset>

            {edit.scope === "REST_OF_CONTRACT" ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Desde año</Label>
                  <Input
                    name="fromYear"
                    type="number"
                    required
                    value={edit.fromYear}
                    onChange={(e) =>
                      setEdit({ ...edit, fromYear: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Desde mes</Label>
                  <Input
                    name="fromMonth"
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={edit.fromMonth}
                    onChange={(e) =>
                      setEdit({ ...edit, fromMonth: e.target.value })
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-1">
                <Label>Cuota</Label>
                <Select
                  name="tenantBillId"
                  value={edit.tenantBillId}
                  onChange={(e) =>
                    setEdit({ ...edit, tenantBillId: e.target.value })
                  }
                  required
                >
                  <option value="">Seleccionar…</option>
                  {openBills.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.periodMonth}/{b.periodYear} · vence{" "}
                      {formatDateOnly(b.dueDate)} ·{" "}
                      {BILL_STATUS_LABELS[b.status]}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {updateState && !updateState.ok ? (
              <p className="mt-3 text-sm text-[var(--destructive)]">
                {updateState.error}
              </p>
            ) : null}

            <div className="mt-5 flex gap-2">
              <Button type="submit" disabled={updatePending}>
                {updatePending ? "Guardando…" : "Confirmar cambio"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEdit(null)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
