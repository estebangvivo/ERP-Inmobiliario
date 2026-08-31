"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly } from "@/lib/dates";
import { BILL_STATUS_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { applyTenantLedgerPaymentAction } from "@/server/actions/billing";
import type { BillDebtDetail } from "@/server/services/tenant-ledger";

type ConceptKey =
  | "rent"
  | "contractServices"
  | "ordinary"
  | "extraordinary"
  | "services"
  | "servicesExtraordinary"
  | "commission"
  | "lateFee"
  | "other";

const CONCEPT_LABEL: Record<ConceptKey, string> = {
  rent: "Alquiler",
  contractServices: "Servicios del contrato",
  ordinary: "Expensas ordinarias",
  extraordinary: "Expensas extraordinarias",
  services: "Servicios",
  servicesExtraordinary: "Servicios extraordinarios",
  commission: "Honorarios",
  lateFee: "Mora",
  other: "Otros",
};

const CONCEPT_ORDER: ConceptKey[] = [
  "rent",
  "contractServices",
  "ordinary",
  "extraordinary",
  "services",
  "servicesExtraordinary",
  "commission",
  "lateFee",
  "other",
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Montos abiertos por concepto alineados al saldo de la cuota.
 * El desglose del snapshot / expensas a veces no cierra con el saldo
 * (pagos parciales, ajustes, etc.): acá se prorratea o se completa en "Otros".
 */
function openConceptMap(bill: BillDebtDetail): Record<ConceptKey, number> {
  const raw: Record<ConceptKey, number> = {
    rent: bill.kind === "SERVICES" ? 0 : Math.max(0, bill.rentAmount),
    contractServices:
      bill.kind === "SERVICES"
        ? Math.max(0, bill.contractServicesAmount)
        : 0,
    ordinary: Math.max(0, bill.ordinaryExpenses),
    extraordinary: Math.max(0, bill.extraordinaryExpenses),
    services: Math.max(0, bill.servicesAmount),
    servicesExtraordinary: Math.max(0, bill.servicesExtraordinaryAmount),
    commission: Math.max(0, bill.commissionAmount),
    lateFee: Math.max(0, bill.lateFeeAmount),
    other: Math.max(0, bill.otherAmount),
  };

  // Preferir snapshot de expensas de la cuota si el desglose vino vacío
  const expensesSnap = Math.max(0, bill.expensesAmount);
  const expensesParts =
    raw.ordinary +
    raw.extraordinary +
    raw.services +
    raw.servicesExtraordinary;
  if (expensesSnap > 0.001 && expensesParts <= 0.001) {
    raw.ordinary = expensesSnap;
  }

  const balance = round2(bill.balance);
  const sum = round2(CONCEPT_ORDER.reduce((s, k) => s + raw[k], 0));

  if (balance <= 0.001) {
    return {
      rent: 0,
      contractServices: 0,
      ordinary: 0,
      extraordinary: 0,
      services: 0,
      servicesExtraordinary: 0,
      commission: 0,
      lateFee: 0,
      other: 0,
    };
  }

  if (sum <= 0.001) {
    return {
      rent: 0,
      contractServices: 0,
      ordinary: 0,
      extraordinary: 0,
      services: 0,
      servicesExtraordinary: 0,
      commission: 0,
      lateFee: 0,
      other: balance,
    };
  }

  if (Math.abs(sum - balance) <= 0.05) {
    // Ajuste menor de redondeo en el último concepto con monto
    const result = { ...raw };
    let allocated = 0;
    let lastKey: ConceptKey = "other";
    for (const k of CONCEPT_ORDER) {
      if (result[k] > 0.001) lastKey = k;
    }
    for (const k of CONCEPT_ORDER) {
      if (k === lastKey) result[k] = round2(balance - allocated);
      else {
        result[k] = round2(result[k]);
        allocated = round2(allocated + result[k]);
      }
    }
    return result;
  }

  if (sum > balance) {
    const factor = balance / sum;
    const result: Record<ConceptKey, number> = {
      rent: 0,
      contractServices: 0,
      ordinary: 0,
      extraordinary: 0,
      services: 0,
      servicesExtraordinary: 0,
      commission: 0,
      lateFee: 0,
      other: 0,
    };
    let allocated = 0;
    const withAmount = CONCEPT_ORDER.filter((k) => raw[k] > 0.001);
    for (let i = 0; i < withAmount.length; i++) {
      const k = withAmount[i]!;
      if (i === withAmount.length - 1) {
        result[k] = round2(balance - allocated);
      } else {
        result[k] = round2(raw[k] * factor);
        allocated = round2(allocated + result[k]);
      }
    }
    return result;
  }

  // sum < balance: diferencia va a "Otros" para poder tildar el saldo completo
  return {
    ...raw,
    other: round2(raw.other + (balance - sum)),
  };
}

function conceptAmount(bill: BillDebtDetail, key: ConceptKey): number {
  return openConceptMap(bill)[key];
}

function conceptsForBill(bill: BillDebtDetail): ConceptKey[] {
  return CONCEPT_ORDER.filter((key) => conceptAmount(bill, key) > 0.001);
}

/** Lista plana de conceptos en orden FIFO (cuotas ya ordenadas por vencimiento). */
function flatConcepts(bills: BillDebtDetail[]) {
  const items: { billId: string; key: ConceptKey; amount: number }[] = [];
  for (const bill of bills) {
    for (const key of conceptsForBill(bill)) {
      items.push({ billId: bill.id, key, amount: conceptAmount(bill, key) });
    }
  }
  return items;
}

function statusVariant(status: string) {
  if (status === "OVERDUE") return "danger" as const;
  if (status === "PARTIAL") return "warning" as const;
  return "secondary" as const;
}

function emptyConcepts(bills: BillDebtDetail[]) {
  const init: Record<string, Set<ConceptKey>> = {};
  for (const b of bills) init[b.id] = new Set();
  return init;
}

/** Tilda conceptos en orden hasta agotar el presupuesto (el último puede ser parcial). */
function allocateUpToBudget(bills: BillDebtDetail[], budget: number) {
  const selectedBills = new Set<string>();
  const selectedConcepts = emptyConcepts(bills);
  const partial: Record<string, Partial<Record<ConceptKey, number>>> = {};
  let remaining = round2(budget);
  let allocated = 0;

  if (!(budget > 0)) {
    return { selectedBills, selectedConcepts, allocated: 0, partial };
  }

  for (const item of flatConcepts(bills)) {
    if (remaining <= 0.001) break;
    const apply = Math.min(item.amount, remaining);
    selectedConcepts[item.billId]!.add(item.key);
    selectedBills.add(item.billId);
    if (apply + 0.001 < item.amount) {
      partial[item.billId] = {
        ...(partial[item.billId] ?? {}),
        [item.key]: apply,
      };
    }
    remaining = round2(remaining - apply);
    allocated = round2(allocated + apply);
  }

  return { selectedBills, selectedConcepts, allocated, partial };
}

export function TenantLedgerPaymentPanel({
  tenantId,
  bills,
  bankAccounts = [],
}: {
  tenantId: string;
  bills: BillDebtDetail[];
  bankAccounts?: { id: string; label: string; currency: string }[];
}) {
  const router = useRouter();
  const currency = bills[0]?.currency ?? "ARS";
  const totalDebt = round2(bills.reduce((s, b) => s + b.balance, 0));

  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [printUrl, setPrintUrl] = useState<string | null>(null);

  const [selectedBills, setSelectedBills] = useState<Set<string>>(
    () => new Set(bills.map((b) => b.id)),
  );
  const [selectedConcepts, setSelectedConcepts] = useState<
    Record<string, Set<ConceptKey>>
  >(() => {
    const init: Record<string, Set<ConceptKey>> = {};
    for (const b of bills) {
      init[b.id] = new Set(conceptsForBill(b));
    }
    return init;
  });

  const [partialConcepts, setPartialConcepts] = useState<
    Record<string, Partial<Record<ConceptKey, number>>>
  >({});

  const [amountMode, setAmountMode] = useState<"all" | "custom">("custom");
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [bankAccountId, setBankAccountId] = useState(
    () => bankAccounts[0]?.id ?? "",
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const banksForCurrency = bankAccounts.filter(
    (b) => b.currency.toUpperCase() === currency.toUpperCase(),
  );

  const budget = useMemo(() => {
    if (amountMode !== "custom") return null;
    const n = Number(customAmount);
    return n > 0 ? round2(n) : null;
  }, [amountMode, customAmount]);

  const effectiveSelectedSum = useMemo(() => {
    let sum = 0;
    for (const bill of bills) {
      if (!selectedBills.has(bill.id)) continue;
      const concepts = selectedConcepts[bill.id] ?? new Set();
      if (concepts.size === 0) {
        sum += bill.balance;
        continue;
      }
      let conceptSum = 0;
      for (const key of concepts) {
        conceptSum +=
          partialConcepts[bill.id]?.[key] ?? conceptAmount(bill, key);
      }
      sum += Math.min(conceptSum, bill.balance);
    }
    return round2(sum);
  }, [bills, selectedBills, selectedConcepts, partialConcepts]);

  const amountToApply = useMemo(() => {
    if (budget != null) {
      if (selectedBills.size === 0) return 0;
      return Math.min(budget, effectiveSelectedSum, totalDebt);
    }
    return effectiveSelectedSum;
  }, [budget, effectiveSelectedSum, totalDebt, selectedBills.size]);

  const remainingAfterPay = round2(totalDebt - amountToApply);

  function applyBudgetSelection(amount: number) {
    const result = allocateUpToBudget(bills, Math.min(amount, totalDebt));
    setSelectedBills(result.selectedBills);
    setSelectedConcepts(result.selectedConcepts);
    setPartialConcepts(result.partial);
    setError(null);
  }

  function onCustomAmountChange(raw: string) {
    setCustomAmount(raw);
    const n = Number(raw);
    if (n > 0) {
      applyBudgetSelection(n);
    }
  }

  function selectUpToBudget() {
    if (budget == null) {
      setSelectedBills(new Set(bills.map((b) => b.id)));
      const init: Record<string, Set<ConceptKey>> = {};
      for (const b of bills) init[b.id] = new Set(conceptsForBill(b));
      setSelectedConcepts(init);
      setPartialConcepts({});
      return;
    }
    applyBudgetSelection(budget);
  }

  function clearBills() {
    setSelectedBills(new Set());
    setSelectedConcepts(emptyConcepts(bills));
    setPartialConcepts({});
  }

  function toggleBill(id: string) {
    const bill = bills.find((b) => b.id === id);
    if (!bill) return;

    if (selectedBills.has(id)) {
      setSelectedBills((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSelectedConcepts((prev) => ({ ...prev, [id]: new Set() }));
      clearPartial(id);
      return;
    }

    // Activar cuota: tildar conceptos que entren en el presupuesto restante
    if (budget != null) {
      let currentSum = 0;
      for (const b of bills) {
        if (!selectedBills.has(b.id)) continue;
        for (const k of selectedConcepts[b.id] ?? []) {
          currentSum += partialConcepts[b.id]?.[k] ?? conceptAmount(b, k);
        }
      }
      currentSum = round2(currentSum);
      let remaining = round2(budget - currentSum);
      if (remaining <= 0.001) {
        setError(
          `El monto a aplicar (${formatMoney(String(budget), currency)}) ya está cubierto. Desmarcá algo para liberar saldo.`,
        );
        return;
      }
      const nextConcepts = new Set<ConceptKey>();
      const nextPartial: Partial<Record<ConceptKey, number>> = {};
      for (const key of conceptsForBill(bill)) {
        if (remaining <= 0.001) break;
        const amt = conceptAmount(bill, key);
        const apply = Math.min(amt, remaining);
        nextConcepts.add(key);
        if (apply + 0.001 < amt) nextPartial[key] = apply;
        remaining = round2(remaining - apply);
      }
      setError(null);
      setSelectedBills((prev) => new Set(prev).add(id));
      setSelectedConcepts((prev) => ({ ...prev, [id]: nextConcepts }));
      setPartialConcepts((prev) => {
        const next = { ...prev };
        if (Object.keys(nextPartial).length === 0) delete next[id];
        else next[id] = nextPartial;
        return next;
      });
      return;
    }

    setSelectedBills((prev) => new Set(prev).add(id));
    setSelectedConcepts((prev) => ({
      ...prev,
      [id]: new Set(conceptsForBill(bill)),
    }));
  }

  function clearPartial(billId: string, key?: ConceptKey) {
    setPartialConcepts((prev) => {
      if (!prev[billId]) return prev;
      if (!key) {
        const next = { ...prev };
        delete next[billId];
        return next;
      }
      const billPartial = { ...prev[billId] };
      delete billPartial[key];
      const next = { ...prev };
      if (Object.keys(billPartial).length === 0) delete next[billId];
      else next[billId] = billPartial;
      return next;
    });
  }

  function toggleConcept(billId: string, key: ConceptKey) {
    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;
    const amt = conceptAmount(bill, key);
    const current = new Set(selectedConcepts[billId] ?? []);

    if (current.has(key)) {
      current.delete(key);
      setSelectedConcepts((prev) => ({ ...prev, [billId]: current }));
      clearPartial(billId, key);
      if (current.size === 0) {
        setSelectedBills((prev) => {
          const next = new Set(prev);
          next.delete(billId);
          return next;
        });
      }
      setError(null);
      return;
    }

    if (budget != null) {
      // Sumar solo lo efectivamente aplicado (respeta parciales)
      let currentSum = 0;
      for (const b of bills) {
        if (!selectedBills.has(b.id)) continue;
        for (const k of selectedConcepts[b.id] ?? []) {
          currentSum += partialConcepts[b.id]?.[k] ?? conceptAmount(b, k);
        }
      }
      currentSum = round2(currentSum);
      const remaining = round2(budget - currentSum);
      if (remaining <= 0.001) {
        setError(
          `El monto a aplicar (${formatMoney(String(budget), currency)}) ya está cubierto.`,
        );
        return;
      }
      if (amt > remaining + 0.001) {
        // Entra parcial: se aplica lo que queda del monto
        current.add(key);
        setError(null);
        setSelectedConcepts((prev) => ({ ...prev, [billId]: current }));
        setSelectedBills((prev) => new Set(prev).add(billId));
        setPartialConcepts((prev) => ({
          ...prev,
          [billId]: { ...(prev[billId] ?? {}), [key]: remaining },
        }));
        return;
      }
    }

    current.add(key);
    setError(null);
    clearPartial(billId, key);
    setSelectedConcepts((prev) => ({ ...prev, [billId]: current }));
    setSelectedBills((prev) => new Set(prev).add(billId));
  }

  function submit(mode: "pay_all" | "pay_selected") {
    setError(null);
    setMessage(null);
    setPrintUrl(null);

    const billIds =
      mode === "pay_all"
        ? bills.map((b) => b.id)
        : bills.filter((b) => selectedBills.has(b.id)).map((b) => b.id);

    if (billIds.length === 0) {
      setError("Seleccioná al menos una cuota o concepto.");
      return;
    }

    const conceptsPayload: Record<string, ConceptKey[]> = {};
    for (const id of billIds) {
      conceptsPayload[id] = [...(selectedConcepts[id] ?? [])];
    }

    let amount: number | null = null;
    let payMode: "pay_all" | "pay_selected" | "pay_amount" =
      mode === "pay_all" ? "pay_all" : "pay_selected";

    if (mode === "pay_selected" && amountMode === "custom") {
      if (budget == null || !(budget > 0)) {
        setError("Indicá un monto válido.");
        return;
      }
      amount = amountToApply;
      if (!(amount > 0)) {
        setError("No hay saldo seleccionable para aplicar.");
        return;
      }
      payMode = "pay_amount";
    }

    if (method === "BANK_TRANSFER" && !bankAccountId) {
      setError("Elegí la cuenta bancaria para la transferencia.");
      return;
    }

    start(async () => {
      const result = await applyTenantLedgerPaymentAction({
        tenantId,
        billIds,
        mode: payMode,
        amount: amount ?? undefined,
        method: method as
          | "CASH"
          | "BANK_TRANSFER"
          | "CHECK"
          | "CARD"
          | "GATEWAY"
          | "OTHER",
        reference: reference || undefined,
        notes: notes || undefined,
        conceptsByBill: conceptsPayload,
        bankAccountId:
          method === "BANK_TRANSFER" ? bankAccountId : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Cobro registrado.");
      if (result.printUrl) {
        setPrintUrl(result.printUrl);
        window.open(result.printUrl, "_blank", "noopener,noreferrer");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar cobro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>Modo de monto</Label>
              <Select
                value={amountMode}
                onChange={(e) => {
                  const next =
                    e.target.value === "custom" ? "custom" : "all";
                  setAmountMode(next);
                  setError(null);
                  if (next === "all") {
                    setSelectedBills(new Set(bills.map((b) => b.id)));
                    const init: Record<string, Set<ConceptKey>> = {};
                    for (const b of bills) {
                      init[b.id] = new Set(conceptsForBill(b));
                    }
                    setSelectedConcepts(init);
                    setPartialConcepts({});
                  } else if (Number(customAmount) > 0) {
                    applyBudgetSelection(Number(customAmount));
                  }
                }}
              >
                <option value="all">Saldo de lo tildado</option>
                <option value="custom">Monto libre (tope al tildar)</option>
              </Select>
            </div>
            {amountMode === "custom" ? (
              <div className="space-y-1">
                <Label htmlFor="customAmount">Monto a aplicar</Label>
                <Input
                  id="customAmount"
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={customAmount}
                  onChange={(e) => onCustomAmountChange(e.target.value)}
                  placeholder="Ej. 5000000"
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="method">Medio</Label>
              <Select
                id="method"
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  if (
                    e.target.value === "BANK_TRANSFER" &&
                    !bankAccountId &&
                    banksForCurrency[0]
                  ) {
                    setBankAccountId(banksForCurrency[0].id);
                  }
                }}
              >
                <option value="BANK_TRANSFER">Transferencia</option>
                <option value="CASH">Efectivo</option>
                <option value="CHECK">Cheque</option>
                <option value="CARD">Tarjeta</option>
                <option value="GATEWAY">Pasarela</option>
                <option value="OTHER">Otro</option>
              </Select>
            </div>
            {method === "BANK_TRANSFER" ? (
              <div className="space-y-1">
                <Label htmlFor="bankAccountId">Cuenta bancaria</Label>
                <Select
                  id="bankAccountId"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                >
                  <option value="">Elegí cuenta…</option>
                  {banksForCurrency.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {method === "CASH" ? (
              <p className="text-xs text-[var(--muted-foreground)] sm:col-span-2 lg:col-span-4">
                Requiere caja diaria abierta en {currency} (Tesorería → Caja).
              </p>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="reference">Referencia</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="notes">Notas</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={selectUpToBudget}
            >
              {amountMode === "custom" && budget
                ? "Tildar hasta el monto"
                : "Marcar todas"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearBills}>
              Desmarcar
            </Button>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3 text-sm">
            <p>
              <span className="text-[var(--muted-foreground)]">Deuda total: </span>
              <strong>{formatMoney(String(totalDebt), currency)}</strong>
            </p>
            <p>
              <span className="text-[var(--muted-foreground)]">Tildado / se aplica: </span>
              <strong className="text-[var(--primary)]">
                {formatMoney(String(amountToApply), currency)}
              </strong>
            </p>
            <p>
              <span className="text-[var(--muted-foreground)]">
                Saldo que queda:{" "}
              </span>
              <strong>
                {formatMoney(String(Math.max(0, remainingAfterPay)), currency)}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending || bills.length === 0}
              onClick={() => submit("pay_all")}
            >
              {pending ? "Aplicando…" : "Pagar todo"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || selectedBills.size === 0}
              onClick={() => submit("pay_selected")}
            >
              {pending ? "Aplicando…" : "Pagar lo tildado"}
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          ) : null}
          {message ? (
            <div className="space-y-1 text-sm text-emerald-700">
              <p>{message}</p>
              {printUrl ? (
                <p>
                  <a
                    href={printUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    Abrir recibo para imprimir / WhatsApp
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {bills.map((bill) => {
          const checked = selectedBills.has(bill.id);
          const concepts = conceptsForBill(bill);
          return (
            <Card
              key={bill.id}
              className={checked ? "border-[var(--primary)]" : undefined}
            >
              <CardHeader className="flex flex-row flex-wrap items-start gap-3 space-y-0">
                <label className="mt-1 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={checked}
                    onChange={() => toggleBill(bill.id)}
                  />
                  <span className="sr-only">Seleccionar cuota</span>
                </label>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base">
                    {bill.installmentLabel} · {bill.contractCode}
                  </CardTitle>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {bill.propertyTitle} · Vence {formatDateOnly(bill.dueDate)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(bill.status)}>
                    {BILL_STATUS_LABELS[
                      bill.status as keyof typeof BILL_STATUS_LABELS
                    ] ?? bill.status}
                  </Badge>
                  <span className="text-sm font-semibold">
                    Saldo {formatMoney(String(bill.balance), currency)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-[var(--muted-foreground)]">
                  {amountMode === "custom"
                    ? "Solo podés tildar conceptos que entren en el monto a aplicar. El resto queda como saldo."
                    : "Tildá qué está pagando:"}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {concepts.map((key) => {
                    const amt = conceptAmount(bill, key);
                    const on = selectedConcepts[bill.id]?.has(key) ?? false;
                    const partialAmt = partialConcepts[bill.id]?.[key];
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={on}
                          onChange={() => toggleConcept(bill.id, key)}
                        />
                        <span className="flex-1">
                          {CONCEPT_LABEL[key]}
                          {partialAmt != null ? (
                            <span className="block text-xs text-[var(--muted-foreground)]">
                              Se aplica{" "}
                              {formatMoney(String(partialAmt), currency)} de{" "}
                              {formatMoney(String(amt), currency)}
                            </span>
                          ) : null}
                        </span>
                        <span className="font-medium">
                          {formatMoney(String(amt), currency)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
