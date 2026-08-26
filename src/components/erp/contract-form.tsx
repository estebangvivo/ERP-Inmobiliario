"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdjustmentIndex,
  ContractStatus,
  Currency,
} from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PartyPersonSearchSelect } from "@/components/erp/party-person-search-select";
import { useGuarantorDuplicateCheck } from "@/components/erp/guarantor-duplicate-modal";
import {
  appendAttachmentDrafts,
  ContractCreateAttachmentsFields,
  type AttachmentDraftRow,
} from "@/components/erp/contract-attachments";
import {
  createContractAction,
  updateContractAction,
  updateContractGuarantorsAction,
} from "@/server/actions/contracts";
import type { ActionResult } from "@/server/actions/users";
import { CONTRACT_STATUS_LABELS } from "@/lib/labels";
import {
  COMMISSION_MODE_LABELS,
  COMMISSION_MODES,
  type CommissionModeValue,
} from "@/features/contracts/lib/commission";

const initial: ActionResult | null = null;

type Person = { id: string; name: string; documentNumber?: string | null };
type PropertyOpt = {
  id: string;
  title: string;
  price?: string | number | null;
  currency?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
};

type PayerPreset = "OWNER" | "TENANT" | "SPLIT";

function GuarantorFields({
  count,
  ids,
  options,
  acknowledgedIds,
  excludeContractId,
  onCountChange,
  onIdChange,
  onAcknowledgedChange,
}: {
  count: number;
  ids: string[];
  options: Person[];
  acknowledgedIds: Set<string>;
  excludeContractId?: string | null;
  onCountChange: (count: number) => void;
  onIdChange: (index: number, value: string) => void;
  onAcknowledgedChange: (userId: string, acknowledged: boolean) => void;
}) {
  const { requestSelect, modal, checking } =
    useGuarantorDuplicateCheck(excludeContractId);

  function handleIdChange(index: number, value: string) {
    const previous = ids[index] ?? "";
    if (!value) {
      if (previous) onAcknowledgedChange(previous, false);
      onIdChange(index, "");
      return;
    }
    if (value === previous) return;

    requestSelect(value, (acked) => {
      if (previous) onAcknowledgedChange(previous, false);
      onIdChange(index, value);
      onAcknowledgedChange(value, acked);
    });
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      {modal}
      <Label htmlFor="guarantorCount">Cantidad de garantes</Label>
      <Select
        id="guarantorCount"
        value={String(count)}
        onChange={(e) => onCountChange(Number(e.target.value))}
      >
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n === 0 ? "Sin garantes" : n}
          </option>
        ))}
      </Select>
      {count > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ids.map((id, index) => (
            <div key={index} className="space-y-2">
              <Label htmlFor={`guarantorId-${index}`}>
                Garante {index + 1}
              </Label>
              <PartyPersonSearchSelect
                id={`guarantorId-${index}`}
                name="guarantorId"
                kind="GUARANTOR"
                value={id}
                onChange={(value) => handleIdChange(index, value)}
                options={options}
                emptyLabel="Seleccionar…"
                required
              />
              {id && acknowledgedIds.has(id) ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200/80 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Se cargó sabiendo que ya era garante en otro contrato
                    activo.
                  </span>
                </div>
              ) : null}
              {id && acknowledgedIds.has(id) ? (
                <input
                  type="hidden"
                  name="guarantorDuplicateAck"
                  value={id}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {checking ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Revisando si el garante ya figura en otros contratos…
        </p>
      ) : null}
    </div>
  );
}

function CommissionFields({
  defaultMode = "PERCENT_RENT",
  defaultValue = "5",
  defaultTenantPct = "0",
  defaultOwnerPct = "100",
  defaultInstallments = "3",
}: {
  defaultMode?: CommissionModeValue;
  defaultValue?: string;
  defaultTenantPct?: string;
  defaultOwnerPct?: string;
  defaultInstallments?: string;
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
        : "Porcentaje % sobre el total";

  return (
    <div className="sm:col-span-2 space-y-4 rounded-lg border border-[var(--border)] p-4">
      <p className="text-sm font-medium">Honorarios inmobiliarios</p>
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
        {mode === "CONTRACT_TOTAL" ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="commissionInstallments">
              Cuotas de honorarios
            </Label>
            <Input
              id="commissionInstallments"
              name="commissionInstallments"
              type="number"
              min={1}
              max={120}
              defaultValue={defaultInstallments}
              required
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              Se calcula el % sobre el total del contrato (alquiler × meses) y
              se genera la parte del inquilino en esa cantidad de cuotas, con
              vencimiento el día 10 de cada mes desde el inicio.
            </p>
          </div>
        ) : null}
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
  const [propertyId, setPropertyId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [guarantorCount, setGuarantorCount] = useState(2);
  const [guarantorIds, setGuarantorIds] = useState<string[]>(["", ""]);
  const [guarantorAckIds, setGuarantorAckIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [attachRows, setAttachRows] = useState<AttachmentDraftRow[]>([
    { key: 0, kind: "CONTRACT_DOC", files: [] },
  ]);
  const [initialRent, setInitialRent] = useState("");
  const [currency, setCurrency] = useState<Currency>("ARS");

  useEffect(() => {
    if (state?.ok) {
      router.push("/contratos");
      router.refresh();
    }
  }, [state, router]);

  useEffect(() => {
    setGuarantorIds((prev) => {
      const next = prev.slice(0, guarantorCount);
      while (next.length < guarantorCount) next.push("");
      setGuarantorAckIds(
        (acks) => new Set([...acks].filter((id) => next.includes(id))),
      );
      return next;
    });
  }, [guarantorCount]);

  function setGuarantorAck(userId: string, acknowledged: boolean) {
    setGuarantorAckIds((prev) => {
      const next = new Set(prev);
      if (acknowledged) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  function onPropertyChange(id: string) {
    setPropertyId(id);
    const prop = properties.find((p) => p.id === id);
    if (!prop) return;
    if (prop.ownerId) setOwnerId(prop.ownerId);
    if (prop.price != null && Number(prop.price) > 0) {
      setInitialRent(String(prop.price));
    }
    if (prop.currency === "ARS" || prop.currency === "USD" || prop.currency === "EUR") {
      setCurrency(prop.currency);
    }
  }

  function createAction(formData: FormData) {
    appendAttachmentDrafts(formData, attachRows);
    return formAction(formData);
  }

  return (
    <form
      action={createAction}
      encType="multipart/form-data"
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="propertyId">Propiedad</Label>
          <Select
            id="propertyId"
            name="propertyId"
            required
            value={propertyId}
            onChange={(e) => onPropertyChange(e.target.value)}
          >
            <option value="" disabled>
              Seleccionar…
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.ownerName ? ` · ${p.ownerName}` : ""}
              </option>
            ))}
          </Select>
          <p className="text-xs text-[var(--muted-foreground)]">
            Al elegir la propiedad se completan propietario y alquiler inicial
            si el sistema ya los conoce.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ownerId">Propietario</Label>
          <PartyPersonSearchSelect
            id="ownerId"
            name="ownerId"
            kind="OWNER"
            value={ownerId}
            onChange={setOwnerId}
            options={owners}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenantId">Inquilino</Label>
          <PartyPersonSearchSelect
            id="tenantId"
            name="tenantId"
            kind="TENANT"
            value={tenantId}
            onChange={setTenantId}
            options={tenants}
            required
          />
        </div>
        <GuarantorFields
          count={guarantorCount}
          ids={guarantorIds}
          options={guarantors}
          acknowledgedIds={guarantorAckIds}
          onCountChange={setGuarantorCount}
          onIdChange={(index, value) =>
            setGuarantorIds((prev) =>
              prev.map((v, i) => (i === index ? value : v)),
            )
          }
          onAcknowledgedChange={setGuarantorAck}
        />
        <ContractCreateAttachmentsFields
          rows={attachRows}
          onChange={setAttachRows}
        />
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
            value={initialRent}
            onChange={(e) => setInitialRent(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Moneda</Label>
          <Select
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
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
            defaultValue={1.2}
          />
        </div>

        <CommissionFields
          defaultMode="CONTRACT_TOTAL"
          defaultValue="5"
          defaultTenantPct="100"
          defaultOwnerPct="0"
          defaultInstallments="1"
        />

        <div className="space-y-2">
          <Label htmlFor="indexType">Índice de ajuste</Label>
          <Select
            id="indexType"
            name="indexType"
            defaultValue={"MAX_ICL_IPC_CP" satisfies AdjustmentIndex}
          >
            <option value="ICL">ICL</option>
            <option value="IPC">IPC</option>
            <option value="CP">CP</option>
            <option value="MAX_ICL_IPC_CP">Mayor entre ICL / IPC / CP</option>
            <option value="CUSTOM_PERCENT">% personalizado</option>
            <option value="FIXED">Fijo</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="periodMonths">Cada cuánto aumenta (meses)</Label>
          <Select
            id="periodMonths"
            name="periodMonths"
            defaultValue="3"
            required
          >
            <option value="2">2 meses</option>
            <option value="3">3 meses</option>
            <option value="4">4 meses</option>
            <option value="6">6 meses</option>
            <option value="9">9 meses</option>
            <option value="12">12 meses</option>
          </Select>
          <p className="text-xs text-[var(--muted-foreground)]">
            Debe coincidir con el período de índices cargado en Contratos.
          </p>
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
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <h3 className="text-base font-semibold">Datos del contrato</h3>
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
      {state?.ok ? (
        <p className="text-sm text-emerald-700">Cambios guardados.</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

export function ContractGuarantorsForm({
  contractId,
  initialIds,
  initialAcknowledgedIds = [],
  guarantors,
}: {
  contractId: string;
  initialIds: string[];
  initialAcknowledgedIds?: string[];
  guarantors: Person[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateContractGuarantorsAction,
    initial,
  );
  const [guarantorCount, setGuarantorCount] = useState(
    Math.min(5, initialIds.length),
  );
  const [guarantorIds, setGuarantorIds] = useState<string[]>(
    initialIds.slice(0, 5),
  );
  const [guarantorAckIds, setGuarantorAckIds] = useState<Set<string>>(
    () => new Set(initialAcknowledgedIds),
  );

  const initialKey = `${initialIds.join(",")}|${initialAcknowledgedIds.join(",")}`;
  useEffect(() => {
    const [idsPart, ackPart] = initialKey.split("|");
    const ids = idsPart ? idsPart.split(",").filter(Boolean) : [];
    const acks = ackPart ? ackPart.split(",").filter(Boolean) : [];
    setGuarantorCount(Math.min(5, ids.length));
    setGuarantorIds(ids.slice(0, 5));
    setGuarantorAckIds(new Set(acks));
  }, [initialKey]);

  useEffect(() => {
    setGuarantorIds((prev) => {
      const next = prev.slice(0, guarantorCount);
      while (next.length < guarantorCount) next.push("");
      setGuarantorAckIds(
        (acks) => new Set([...acks].filter((id) => next.includes(id))),
      );
      return next;
    });
  }, [guarantorCount]);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  function setGuarantorAck(userId: string, acknowledged: boolean) {
    setGuarantorAckIds((prev) => {
      const next = new Set(prev);
      if (acknowledged) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <input type="hidden" name="id" value={contractId} />
      <div>
        <h3 className="text-base font-semibold">Garantes</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Podés agregar, cambiar o quitar garantes de un contrato ya creado.
        </p>
      </div>
      <GuarantorFields
        count={guarantorCount}
        ids={guarantorIds}
        options={guarantors}
        acknowledgedIds={guarantorAckIds}
        excludeContractId={contractId}
        onCountChange={setGuarantorCount}
        onIdChange={(index, value) =>
          setGuarantorIds((prev) =>
            prev.map((v, i) => (i === index ? value : v)),
          )
        }
        onAcknowledgedChange={setGuarantorAck}
      />
      {state && !state.ok ? (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-emerald-700">{state.message}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar garantes"}
      </Button>
    </form>
  );
}
