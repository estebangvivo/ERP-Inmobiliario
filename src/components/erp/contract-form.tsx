"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdjustmentIndex,
  ContractStatus,
  Currency,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createContractAction,
  updateContractAction,
} from "@/server/actions/contracts";
import type { ActionResult } from "@/server/actions/users";
import { CONTRACT_STATUS_LABELS } from "@/lib/labels";
import {
  COMMISSION_MODE_LABELS,
  COMMISSION_MODES,
  type CommissionModeValue,
} from "@/features/contracts/lib/commission";

const initial: ActionResult | null = null;

type Person = { id: string; name: string };
type PropertyOpt = { id: string; title: string };

type PayerPreset = "OWNER" | "TENANT" | "SPLIT";

function CommissionFields({
  defaultMode = "PERCENT_RENT",
  defaultValue = "5",
  defaultTenantPct = "0",
  defaultOwnerPct = "100",
}: {
  defaultMode?: CommissionModeValue;
  defaultValue?: string;
  defaultTenantPct?: string;
  defaultOwnerPct?: string;
}) {
  const [mode, setMode] = useState<CommissionModeValue>(defaultMode);
  const [tenantPct, setTenantPct] = useState(defaultTenantPct);
  const [ownerPct, setOwnerPct] = useState(defaultOwnerPct);

  const preset: PayerPreset = useMemo(() => {
    const t = Number(tenantPct);
    const o = Number(ownerPct);
    if (t === 0 && o === 100) return "OWNER";
    if (t === 100 && o === 0) return "TENANT";
    return "SPLIT";
  }, [tenantPct, ownerPct]);

  const valueLabel =
    mode === "PERCENT_RENT"
      ? "Porcentaje %"
      : mode === "FIXED_AMOUNT"
        ? "Monto fijo por período"
        : "Monto total del contrato";

  return (
    <div className="sm:col-span-2 space-y-4 rounded-lg border border-[var(--border)] p-4">
      <p className="text-sm font-medium">Comisión inmobiliaria</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="commissionMode">Cálculo</Label>
          <Select
            id="commissionMode"
            name="commissionMode"
            value={mode}
            onChange={(e) => setMode(e.target.value as CommissionModeValue)}
          >
            {COMMISSION_MODES.map((m) => (
              <option key={m} value={m}>
                {COMMISSION_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="commissionValue">{valueLabel}</Label>
          <Input
            id="commissionValue"
            name="commissionValue"
            type="number"
            step="0.01"
            min={0}
            defaultValue={defaultValue}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="commissionPayerPreset">Quién paga</Label>
          <Select
            id="commissionPayerPreset"
            value={preset}
            onChange={(e) => {
              const v = e.target.value as PayerPreset;
              if (v === "OWNER") {
                setTenantPct("0");
                setOwnerPct("100");
              } else if (v === "TENANT") {
                setTenantPct("100");
                setOwnerPct("0");
              } else {
                setTenantPct("50");
                setOwnerPct("50");
              }
            }}
          >
            <option value="OWNER">Propietario (100%)</option>
            <option value="TENANT">Inquilino (100%)</option>
            <option value="SPLIT">Reparto personalizado</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="commissionTenantPct">% Inquilino</Label>
          <Input
            id="commissionTenantPct"
            name="commissionTenantPct"
            type="number"
            step="0.01"
            min={0}
            max={100}
            value={tenantPct}
            onChange={(e) => {
              const t = e.target.value;
              setTenantPct(t);
              const tn = Number(t);
              if (Number.isFinite(tn)) {
                setOwnerPct(String(Math.round((100 - tn) * 100) / 100));
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="commissionOwnerPct">% Propietario</Label>
          <Input
            id="commissionOwnerPct"
            name="commissionOwnerPct"
            type="number"
            step="0.01"
            min={0}
            max={100}
            value={ownerPct}
            onChange={(e) => {
              const o = e.target.value;
              setOwnerPct(o);
              const on = Number(o);
              if (Number.isFinite(on)) {
                setTenantPct(String(Math.round((100 - on) * 100) / 100));
              }
            }}
          />
        </div>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Si paga el propietario, se descuenta en la rendición. Si paga el
        inquilino, se suma en la cuota. El reparto personalizado combina ambos.
        El monto total del contrato se prorratea por mes de vigencia.
      </p>
    </div>
  );
}

export function ContractCreateForm({
  properties,
  owners,
  tenants,
  guarantors,
}: {
  properties: PropertyOpt[];
  owners: Person[];
  tenants: Person[];
  guarantors: Person[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createContractAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) {
      router.push("/contratos");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="propertyId">Propiedad</Label>
          <Select id="propertyId" name="propertyId" required defaultValue="">
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
        <div className="space-y-2">
          <Label htmlFor="ownerId">Propietario</Label>
          <Select id="ownerId" name="ownerId" required defaultValue="">
            <option value="" disabled>
              Seleccionar…
            </option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenantId">Inquilino</Label>
          <Select id="tenantId" name="tenantId" required defaultValue="">
            <option value="" disabled>
              Seleccionar…
            </option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="guarantorId">Garante (opcional)</Label>
          <Select id="guarantorId" name="guarantorId" defaultValue="">
            <option value="">Sin garante</option>
            {guarantors.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="startDate">Inicio</Label>
          <Input id="startDate" name="startDate" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Fin</Label>
          <Input id="endDate" name="endDate" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="initialRent">Alquiler inicial</Label>
          <Input
            id="initialRent"
            name="initialRent"
            type="number"
            step="0.01"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Moneda</Label>
          <Select
            id="currency"
            name="currency"
            defaultValue={"ARS" satisfies Currency}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="depositAmount">Depósito / garantía</Label>
          <Input
            id="depositAmount"
            name="depositAmount"
            type="number"
            step="0.01"
            defaultValue={0}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lateFeeDailyRatePct">Mora diaria %</Label>
          <Input
            id="lateFeeDailyRatePct"
            name="lateFeeDailyRatePct"
            type="number"
            step="0.0001"
            defaultValue={0.05}
          />
        </div>

        <CommissionFields />

        <div className="space-y-2">
          <Label htmlFor="indexType">Índice de ajuste</Label>
          <Select
            id="indexType"
            name="indexType"
            defaultValue={"ICL" satisfies AdjustmentIndex}
          >
            <option value="ICL">ICL</option>
            <option value="IPC">IPC</option>
            <option value="CUSTOM_PERCENT">% custom</option>
            <option value="FIXED">Fijo</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="periodMonths">Período ajuste (meses)</Label>
          <Input
            id="periodMonths"
            name="periodMonths"
            type="number"
            defaultValue={6}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includesOrdinaryExp"
            defaultChecked
            className="h-4 w-4"
          />
          Incluye expensas ordinarias
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="includesExtraordExp" className="h-4 w-4" />
          Incluye expensas extraordinarias
        </label>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Crear contrato"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/contratos")}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function ContractEditForm({
  contract,
}: {
  contract: {
    id: string;
    status: ContractStatus;
    endDate: string;
    commissionMode: CommissionModeValue;
    commissionValue: string;
    commissionTenantPct: string;
    commissionOwnerPct: string;
    lateFeeDailyRatePct: string;
    includesOrdinaryExp: boolean;
    includesExtraordExp: boolean;
    notes: string | null;
  };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateContractAction,
    initial,
  );

  useEffect(() => {
    if (state?.ok) {
      router.push("/contratos");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <input type="hidden" name="id" value={contract.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <Select id="status" name="status" defaultValue={contract.status}>
            {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {CONTRACT_STATUS_LABELS[s]}
                </option>
              ),
            )}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Fin</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={contract.endDate}
            required
          />
        </div>

        <CommissionFields
          defaultMode={contract.commissionMode}
          defaultValue={contract.commissionValue}
          defaultTenantPct={contract.commissionTenantPct}
          defaultOwnerPct={contract.commissionOwnerPct}
        />

        <div className="space-y-2">
          <Label htmlFor="lateFeeDailyRatePct">Mora diaria %</Label>
          <Input
            id="lateFeeDailyRatePct"
            name="lateFeeDailyRatePct"
            type="number"
            step="0.0001"
            defaultValue={contract.lateFeeDailyRatePct}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={contract.notes ?? ""}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includesOrdinaryExp"
            defaultChecked={contract.includesOrdinaryExp}
            className="h-4 w-4"
          />
          Incluye expensas ordinarias
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includesExtraordExp"
            defaultChecked={contract.includesExtraordExp}
            className="h-4 w-4"
          />
          Incluye expensas extraordinarias
        </label>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
