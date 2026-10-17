"use client";

import { useMemo, useState } from "react";
import type { ContractServicePaidBy, ServiceCostCategory } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  CONTRACT_SERVICE_PRESETS,
  CONTRACT_SERVICE_PAID_BY_LABELS,
  defaultConceptForCategory,
  serviceCategoryHasMeter,
} from "@/features/contracts/lib/contract-services";

export type ContractServiceDraft = {
  key: string;
  category: ServiceCostCategory;
  concept: string;
  amount: string;
  paidBy: ContractServicePaidBy;
  providerContractNumber: string;
  meterNumber: string;
  enabled: boolean;
  isCustom?: boolean;
};

function newKey() {
  return `svc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildInitialRows(): ContractServiceDraft[] {
  return CONTRACT_SERVICE_PRESETS.map((preset) => ({
    key: newKey(),
    category: preset.category,
    concept: preset.concept,
    amount: "",
    paidBy: "TENANT" as ContractServicePaidBy,
    providerContractNumber: "",
    meterNumber: "",
    enabled: false,
  }));
}

type Props = {
  value?: ContractServiceDraft[];
  onChange?: (rows: ContractServiceDraft[]) => void;
};

export function ContractServicesFields({ value, onChange }: Props) {
  const [internalRows, setInternalRows] = useState<ContractServiceDraft[]>(
    () => value ?? buildInitialRows(),
  );
  const rows = value ?? internalRows;

  function updateRows(next: ContractServiceDraft[]) {
    if (!value) setInternalRows(next);
    onChange?.(next);
  }

  const jsonPayload = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => r.enabled && Number(r.amount) > 0)
          .map((r) => ({
            category: r.category,
            concept: r.concept.trim() || defaultConceptForCategory(r.category),
            amount: Number(r.amount),
            paidBy: r.paidBy,
            providerContractNumber: r.providerContractNumber.trim() || undefined,
            meterNumber: serviceCategoryHasMeter(r.category)
              ? r.meterNumber.trim() || undefined
              : undefined,
            active: true,
          })),
      ),
    [rows],
  );

  function patchRow(key: string, patch: Partial<ContractServiceDraft>) {
    updateRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addCustomRow() {
    updateRows([
      ...rows,
      {
        key: newKey(),
        category: "OTHER",
        concept: "",
        amount: "",
        paidBy: "TENANT",
        providerContractNumber: "",
        meterNumber: "",
        enabled: true,
        isCustom: true,
      },
    ]);
  }

  function removeRow(key: string) {
    updateRows(rows.filter((r) => r.key !== key));
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:col-span-2">
      <div>
        <h3 className="text-base font-semibold">Servicios mensuales</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Luz, agua, gas y tasas se cobran aparte del alquiler. Indicá quién
          paga cada uno y el N° de contrato del servicio (y medidor en luz,
          agua y gas).
        </p>
      </div>

      <input type="hidden" name="contractServicesJson" value={jsonPayload} />

      <div className="space-y-3">
        {rows.map((row) => {
          const showMeter = serviceCategoryHasMeter(row.category);
          return (
            <div
              key={row.key}
              className="grid gap-3 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[auto_repeat(2,minmax(0,1fr))_auto]"
            >
              <label className="flex items-center gap-2 pt-2 text-sm sm:row-span-2">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) =>
                    patchRow(row.key, { enabled: e.target.checked })
                  }
                  className="h-4 w-4"
                />
              </label>

              <div className="space-y-1">
                <Label className="text-xs">Concepto</Label>
                {row.isCustom ? (
                  <Input
                    value={row.concept}
                    onChange={(e) =>
                      patchRow(row.key, { concept: e.target.value })
                    }
                    placeholder="Ej. Internet, seguro"
                    disabled={!row.enabled}
                  />
                ) : (
                  <p className="py-2 text-sm font-medium">{row.concept}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Monto mensual</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.amount}
                  onChange={(e) =>
                    patchRow(row.key, { amount: e.target.value })
                  }
                  disabled={!row.enabled}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Paga</Label>
                <Select
                  value={row.paidBy}
                  onChange={(e) =>
                    patchRow(row.key, {
                      paidBy: e.target.value as ContractServicePaidBy,
                    })
                  }
                  disabled={!row.enabled}
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

              <div className="space-y-1 sm:col-start-2">
                <Label className="text-xs">N° contrato del servicio</Label>
                <Input
                  value={row.providerContractNumber}
                  onChange={(e) =>
                    patchRow(row.key, {
                      providerContractNumber: e.target.value,
                    })
                  }
                  disabled={!row.enabled}
                  placeholder="N° de cuenta / contrato"
                />
              </div>

              {showMeter ? (
                <div className="space-y-1">
                  <Label className="text-xs">N° medidor</Label>
                  <Input
                    value={row.meterNumber}
                    onChange={(e) =>
                      patchRow(row.key, { meterNumber: e.target.value })
                    }
                    disabled={!row.enabled}
                    placeholder="N° de medidor"
                  />
                </div>
              ) : (
                <div className="hidden sm:block" />
              )}

              {row.isCustom ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="self-end"
                  onClick={() => removeRow(row.key)}
                  aria-label="Quitar servicio"
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : (
                <span className="hidden sm:block" />
              )}
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addCustomRow}>
        <Plus className="mr-1 size-4" />
        Agregar otro servicio
      </Button>
    </div>
  );
}
