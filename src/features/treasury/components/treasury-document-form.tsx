"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  createPaymentOrder,
  createReceipt,
  postPaymentOrder,
  postReceipt,
  type TreasuryLineInput,
} from "@/features/treasury/actions/treasury-actions";
import type { TreasuryPaymentMethod } from "@prisma/client";
import type { TreasuryContractOption } from "@/features/treasury/queries/list-contracts-for-treasury";
import type { TreasuryPaymentInput } from "@/features/treasury/lib/payments";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PartyPersonSearchSelect } from "@/components/erp/party-person-search-select";
import { formatMoney, PAYMENT_METHOD_LABEL } from "@/features/treasury/lib/labels";
import {
  checkFormatLabel,
} from "@/features/treasury/lib/check-number";
import { withOpenCashRetry } from "@/features/treasury/lib/with-open-cash-retry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Option = { id: string; name: string; documentNumber?: string | null };
type LineState = TreasuryLineInput & { key: string };
type PaymentState = TreasuryPaymentInput & { key: string };

export type PortfolioCheckOption = {
  id: string;
  number: string;
  bank: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  drawerName: string | null;
  isElectronic: boolean;
  label: string;
};

export type BankAccountFormOption = {
  id: string;
  name: string;
  bankName: string;
  currency: string;
  label: string;
};

type TreasuryDocumentFormProps = {
  kind: "receipt" | "payment-order";
  contracts: TreasuryContractOption[];
  parties: Option[];
  defaultCurrency?: string;
  enabledCurrencies?: string[];
  defaultContractId?: string;
  portfolioChecks?: PortfolioCheckOption[];
  bankAccounts?: BankAccountFormOption[];
  openDocuments?: {
    id: string;
    label: string;
    balance: number;
    currency: string;
  }[];
  openSettlements?: {
    id: string;
    label: string;
    balance: number;
    currency: string;
  }[];
  defaultDocumentApps?: { documentId: string; amount: number }[];
  defaultConcept?: string;
  defaultAmount?: number;
  defaultPartyId?: string;
};

const METHOD_OPTIONS: TreasuryPaymentMethod[] = [
  "CASH",
  "TRANSFER",
  "CHECK",
  "OTHER",
];

function emptyLine(contractId = ""): LineState {
  return {
    key: Math.random().toString(36).slice(2),
    description: "",
    amount: 0,
    contractId,
    propertyId: "",
  };
}

function emptyPayment(amount = 0): PaymentState {
  return {
    key: Math.random().toString(36).slice(2),
    method: "CASH",
    amount,
    bankAccountId: "",
    checkInstrumentId: "",
    isOwnCheck: false,
    isElectronicCheck: undefined,
    checkNumber: "",
    checkBank: "",
    checkIssueDate: "",
    checkDueDate: "",
    checkAccount: "",
  };
}

function resolveDefaultPartyId(
  kind: "receipt" | "payment-order",
  contracts: TreasuryContractOption[],
  defaultContractId?: string,
): string {
  if (!defaultContractId) return "";
  const contract = contracts.find((c) => c.id === defaultContractId);
  if (!contract) return "";
  if (kind === "receipt") return contract.tenantId ?? "";
  return contract.supplierIds[0] ?? "";
}

export function TreasuryDocumentForm({
  kind,
  contracts,
  parties,
  defaultCurrency = "ARS",
  enabledCurrencies = ["ARS", "USD"],
  defaultContractId = "",
  portfolioChecks = [],
  bankAccounts = [],
  openDocuments = [],
  openSettlements = [],
  defaultDocumentApps = [],
  defaultConcept = "",
  defaultAmount = 0,
  defaultPartyId,
}: TreasuryDocumentFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [partyId, setPartyId] = useState(() =>
    defaultPartyId !== undefined
      ? defaultPartyId
      : resolveDefaultPartyId(kind, contracts, defaultContractId),
  );
  const [partyName, setPartyName] = useState("");
  const [concept, setConcept] = useState(defaultConcept);
  const prefilledAppTotal = defaultDocumentApps.reduce(
    (acc, a) => acc + (Number(a.amount) || 0),
    0,
  );
  const suggestedAmount =
    prefilledAppTotal > 0
      ? prefilledAppTotal
      : Number.isFinite(defaultAmount) && defaultAmount > 0
        ? defaultAmount
        : 0;
  const [currency, setCurrency] = useState(() => {
    const firstAppId = defaultDocumentApps[0]?.documentId;
    const doc = firstAppId
      ? openDocuments.find((d) => d.id === firstAppId)
      : undefined;
    return doc?.currency || defaultCurrency;
  });
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>(() => {
    const line = emptyLine(defaultContractId);
    if (defaultConcept) line.description = defaultConcept;
    if (suggestedAmount > 0) line.amount = suggestedAmount;
    return [line];
  });
  const [payments, setPayments] = useState<PaymentState[]>(() => [
    emptyPayment(suggestedAmount > 0 ? suggestedAmount : 0),
  ]);
  const [billApps, setBillApps] = useState<
    { key: string; documentId: string; amount: string }[]
  >(() =>
    kind === "receipt"
      ? defaultDocumentApps
          .filter((a) => a.documentId && a.amount > 0)
          .map((a) => ({
            key: Math.random().toString(36).slice(2),
            documentId: a.documentId,
            amount: String(a.amount),
          }))
      : [],
  );
  const [invoiceApps, setInvoiceApps] = useState<
    { key: string; documentId: string; amount: string }[]
  >(() =>
    kind === "payment-order"
      ? defaultDocumentApps
          .filter((a) => a.documentId && a.amount > 0)
          .map((a) => ({
            key: Math.random().toString(36).slice(2),
            documentId: a.documentId,
            amount: String(a.amount),
          }))
      : [],
  );
  const [settlementApps, setSettlementApps] = useState<
    { key: string; documentId: string; amount: string }[]
  >([]);

  const paymentsTotal = useMemo(
    () =>
      Math.round(
        payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0) * 100,
      ) / 100,
    [payments],
  );

  useEffect(() => {
    if (lines.length !== 1) return;
    setLines((prev) => {
      if (prev.length !== 1) return prev;
      if (Number(prev[0].amount) === paymentsTotal) return prev;
      return [{ ...prev[0], amount: paymentsTotal }];
    });
  }, [paymentsTotal, lines.length]);

  const linesTotal = useMemo(
    () =>
      Math.round(
        lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0) * 100,
      ) / 100,
    [lines],
  );

  const filteredContracts = useMemo(() => {
    const byParty = !partyId
      ? contracts
      : kind === "receipt"
        ? contracts.filter((c) => c.tenantId === partyId)
        : contracts.filter((c) => c.supplierIds.includes(partyId));

    if (!defaultContractId) return byParty;
    const pinned = contracts.find((c) => c.id === defaultContractId);
    if (!pinned) return byParty;
    if (byParty.some((c) => c.id === pinned.id)) return byParty;
    return [pinned, ...byParty];
  }, [kind, partyId, contracts, defaultContractId]);

  function contractPropertyId(contractId: string) {
    return contracts.find((c) => c.id === contractId)?.propertyId ?? "";
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.contractId) {
          next.propertyId = contractPropertyId(patch.contractId);
        }
        return next;
      }),
    );
  }

  function updatePayment(key: string, patch: Partial<PaymentState>) {
    setPayments((prev) =>
      prev.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    );
  }

  function onPartyChange(nextPartyId: string) {
    setPartyId(nextPartyId);
    const allowed = new Set(
      (kind === "receipt"
        ? contracts.filter((c) => c.tenantId === nextPartyId)
        : contracts.filter((c) => c.supplierIds.includes(nextPartyId))
      ).map((c) => c.id),
    );
    setLines((prev) =>
      prev.map((line) => {
        if (!line.contractId || allowed.has(line.contractId)) return line;
        return { ...line, contractId: "", propertyId: "" };
      }),
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const payload = {
        issueDate,
        concept: concept || undefined,
        currency,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          description: l.description,
          amount: Number(l.amount) || 0,
          contractId: l.contractId || undefined,
          propertyId: l.propertyId || contractPropertyId(l.contractId ?? ""),
        })),
        payments: payments
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({
            method: p.method,
            amount: Number(p.amount) || 0,
            bankAccountId: p.bankAccountId || undefined,
            checkInstrumentId: p.isOwnCheck
              ? undefined
              : p.checkInstrumentId || undefined,
            isOwnCheck:
              kind === "payment-order" ? Boolean(p.isOwnCheck) : undefined,
            isElectronicCheck:
              p.method === "CHECK" && typeof p.isElectronicCheck === "boolean"
                ? p.isElectronicCheck
                : undefined,
            checkNumber: p.checkNumber || undefined,
            checkBank: p.checkBank || undefined,
            checkIssueDate: p.checkIssueDate || undefined,
            checkDueDate: p.checkDueDate || undefined,
            checkAccount: p.checkAccount || undefined,
          })),
      };

      const parsedBillApps = billApps
        .map((a) => ({
          documentId: a.documentId,
          amount: Number(String(a.amount).replace(",", ".")) || 0,
        }))
        .filter((a) => a.documentId && a.amount > 0);

      const parsedInvoiceApps = invoiceApps
        .map((a) => ({
          documentId: a.documentId,
          amount: Number(String(a.amount).replace(",", ".")) || 0,
        }))
        .filter((a) => a.documentId && a.amount > 0);

      const parsedSettlementApps = settlementApps
        .map((a) => ({
          documentId: a.documentId,
          amount: Number(String(a.amount).replace(",", ".")) || 0,
        }))
        .filter((a) => a.documentId && a.amount > 0);

      const result =
        kind === "receipt"
          ? await createReceipt({
              ...payload,
              tenantId: partyId || undefined,
              partyName: partyName || undefined,
              billApps: parsedBillApps,
            })
          : await createPaymentOrder({
              ...payload,
              supplierId: partyId || undefined,
              partyName: partyName || undefined,
              invoiceApps: parsedInvoiceApps,
              settlementApps: parsedSettlementApps,
            });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      let imputed = !result.postError;
      if (result.postError) {
        const isReceipt = kind === "receipt";
        if (result.postCode === "NO_OPEN_CASH") {
          const posted = await withOpenCashRetry(() =>
            isReceipt ? postReceipt(result.id) : postPaymentOrder(result.id),
          );
          imputed = posted.ok;
        }
      }

      const detailHref =
        kind === "receipt"
          ? `/tesoreria/recibos/${result.id}`
          : `/tesoreria/ordenes-pago/${result.id}`;
      const printHref = `${detailHref}/print?autoPrint=1`;
      const wantsPrint = window.confirm(
        imputed
          ? "Documento creado e imputado. ¿Imprimir?"
          : "¿Imprimir el reporte?",
      );

      router.push(wantsPrint ? printHref : detailHref);
      router.refresh();
    });
  }

  const partyLabel = kind === "receipt" ? "Inquilino" : "Proveedor";
  const linesDiff = Math.round((linesTotal - paymentsTotal) * 100) / 100;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="block text-sm">
          <Label className="mb-1">Fecha</Label>
          <DateInput required value={issueDate} onChange={setIssueDate} />
        </div>
        <div className="block text-sm">
          <Label className="mb-1">Moneda</Label>
          <Select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {enabledCurrencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </div>
        <div className="block text-sm">
          <Label className="mb-1">{partyLabel}</Label>
          {kind === "receipt" ? (
            <PartyPersonSearchSelect
              kind="TENANT"
              name="partyId"
              value={partyId}
              onChange={(id, person) => {
                onPartyChange(id);
                if (person?.name) setPartyName(person.name);
              }}
              options={parties}
              emptyLabel="Sin catálogo / otro"
            />
          ) : (
            <SearchableSelect
              value={partyId}
              onChange={onPartyChange}
              emptyLabel="Sin catálogo / otro"
              placeholder={`Elegir ${partyLabel.toLowerCase()}…`}
              options={parties.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
        </div>
        <div className="block text-sm">
          <Label className="mb-1">Nombre libre</Label>
          <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} />
        </div>
        <div className="block text-sm sm:col-span-2">
          <Label className="mb-1">Concepto</Label>
          <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Líneas</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines((prev) => [...prev, emptyLine(defaultContractId)])
            }
          >
            <Plus className="size-4" /> Línea
          </Button>
        </div>
        {lines.map((line) => (
          <div
            key={line.key}
            className="grid gap-2 rounded-md border border-[var(--border)] p-3 sm:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <Label>Contrato</Label>
              <Select
                value={line.contractId ?? ""}
                onChange={(e) =>
                  updateLine(line.key, { contractId: e.target.value })
                }
              >
                <option value="">Elegir…</option>
                {filteredContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.propertyTitle}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Descripción</Label>
              <Input
                required
                value={line.description}
                onChange={(e) =>
                  updateLine(line.key, { description: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                step="0.01"
                required
                value={line.amount || ""}
                onChange={(e) =>
                  updateLine(line.key, { amount: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setLines((prev) =>
                    prev.length > 1
                      ? prev.filter((l) => l.key !== line.key)
                      : prev,
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        {Math.abs(linesDiff) > 0.009 ? (
          <p className="text-sm text-[var(--destructive)]">
            Líneas ({formatMoney(linesTotal, currency)}) ≠ medios (
            {formatMoney(paymentsTotal, currency)})
          </p>
        ) : null}
      </section>

      {kind === "receipt" && openDocuments.length > 0 ? (
        <section className="space-y-3">
          <h3 className="font-medium">Aplicar a cuotas</h3>
          {billApps.map((app) => (
            <div key={app.key} className="grid gap-2 sm:grid-cols-3">
              <Select
                value={app.documentId}
                onChange={(e) =>
                  setBillApps((prev) =>
                    prev.map((a) =>
                      a.key === app.key
                        ? { ...a, documentId: e.target.value }
                        : a,
                    ),
                  )
                }
              >
                <option value="">Elegir…</option>
                {openDocuments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                step="0.01"
                value={app.amount}
                onChange={(e) =>
                  setBillApps((prev) =>
                    prev.map((a) =>
                      a.key === app.key ? { ...a, amount: e.target.value } : a,
                    ),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setBillApps((prev) => [
                ...prev,
                {
                  key: Math.random().toString(36).slice(2),
                  documentId: "",
                  amount: "",
                },
              ])
            }
          >
            + Aplicación
          </Button>
        </section>
      ) : null}

      {kind === "payment-order" && openDocuments.length > 0 ? (
        <section className="space-y-3">
          <h3 className="font-medium">Aplicar a facturas</h3>
          {invoiceApps.map((app) => (
            <div key={app.key} className="grid gap-2 sm:grid-cols-3">
              <Select
                value={app.documentId}
                onChange={(e) =>
                  setInvoiceApps((prev) =>
                    prev.map((a) =>
                      a.key === app.key
                        ? { ...a, documentId: e.target.value }
                        : a,
                    ),
                  )
                }
              >
                <option value="">Elegir…</option>
                {openDocuments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                step="0.01"
                value={app.amount}
                onChange={(e) =>
                  setInvoiceApps((prev) =>
                    prev.map((a) =>
                      a.key === app.key ? { ...a, amount: e.target.value } : a,
                    ),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setInvoiceApps((prev) => [
                ...prev,
                {
                  key: Math.random().toString(36).slice(2),
                  documentId: "",
                  amount: "",
                },
              ])
            }
          >
            + Factura
          </Button>
        </section>
      ) : null}

      {kind === "payment-order" && openSettlements.length > 0 ? (
        <section className="space-y-3">
          <h3 className="font-medium">Aplicar a rendiciones</h3>
          {settlementApps.map((app) => (
            <div key={app.key} className="grid gap-2 sm:grid-cols-3">
              <Select
                value={app.documentId}
                onChange={(e) =>
                  setSettlementApps((prev) =>
                    prev.map((a) =>
                      a.key === app.key
                        ? { ...a, documentId: e.target.value }
                        : a,
                    ),
                  )
                }
              >
                <option value="">Elegir…</option>
                {openSettlements.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                step="0.01"
                value={app.amount}
                onChange={(e) =>
                  setSettlementApps((prev) =>
                    prev.map((a) =>
                      a.key === app.key ? { ...a, amount: e.target.value } : a,
                    ),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setSettlementApps((prev) => [
                ...prev,
                {
                  key: Math.random().toString(36).slice(2),
                  documentId: "",
                  amount: "",
                },
              ])
            }
          >
            + Rendición
          </Button>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Medios de pago</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPayments((prev) => [...prev, emptyPayment()])}
          >
            <Plus className="size-4" /> Medio
          </Button>
        </div>
        {payments.map((payment) => (
          <div
            key={payment.key}
            className="grid gap-2 rounded-md border border-[var(--border)] p-3 sm:grid-cols-4"
          >
            <div>
              <Label>Medio</Label>
              <Select
                value={payment.method}
                onChange={(e) =>
                  updatePayment(payment.key, {
                    method: e.target.value as TreasuryPaymentMethod,
                  })
                }
              >
                {METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Monto</Label>
              <Input
                type="number"
                step="0.01"
                value={payment.amount || ""}
                onChange={(e) =>
                  updatePayment(payment.key, {
                    amount: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            {payment.method === "TRANSFER" ? (
              <div className="sm:col-span-2">
                <Label>Cuenta bancaria</Label>
                <Select
                  value={payment.bankAccountId ?? ""}
                  onChange={(e) =>
                    updatePayment(payment.key, {
                      bankAccountId: e.target.value,
                    })
                  }
                >
                  <option value="">Elegir…</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {payment.method === "CHECK" && kind === "payment-order" ? (
              <div className="sm:col-span-4 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(payment.isOwnCheck)}
                    onChange={(e) =>
                      updatePayment(payment.key, {
                        isOwnCheck: e.target.checked,
                        checkInstrumentId: "",
                      })
                    }
                  />
                  Cheque propio
                </label>
                {!payment.isOwnCheck ? (
                  <Select
                    value={payment.checkInstrumentId ?? ""}
                    onChange={(e) =>
                      updatePayment(payment.key, {
                        checkInstrumentId: e.target.value,
                      })
                    }
                  >
                    <option value="">Cartera…</option>
                    {portfolioChecks.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                ) : null}
              </div>
            ) : null}
            {payment.method === "CHECK" &&
            (kind === "receipt" || payment.isOwnCheck) ? (
              <div className="sm:col-span-4 grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="N° cheque"
                  value={payment.checkNumber ?? ""}
                  onChange={(e) =>
                    updatePayment(payment.key, { checkNumber: e.target.value })
                  }
                />
                <Input
                  placeholder="Banco"
                  value={payment.checkBank ?? ""}
                  onChange={(e) =>
                    updatePayment(payment.key, { checkBank: e.target.value })
                  }
                />
                <Input
                  type="date"
                  value={payment.checkDueDate ?? ""}
                  onChange={(e) =>
                    updatePayment(payment.key, { checkDueDate: e.target.value })
                  }
                />
                <p className="text-xs text-[var(--muted-foreground)] self-center">
                  {checkFormatLabel(Boolean(payment.isElectronicCheck))}
                </p>
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <div>
        <Label className="mb-1">Notas</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error ? (
        <p className="text-sm text-[var(--destructive)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : kind === "receipt" ? "Crear recibo" : "Crear orden de pago"}
      </Button>
    </form>
  );
}
