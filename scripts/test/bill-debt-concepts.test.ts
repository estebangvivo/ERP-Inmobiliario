import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  openConceptMap,
  BILL_CONCEPT_LABEL,
} from "../../src/features/billing/lib/bill-debt-concepts";
import type { BillDebtDetail } from "@/server/services/tenant-ledger";

function bill(partial: Partial<BillDebtDetail>): BillDebtDetail {
  return {
    id: "b1",
    unitId: null,
    kind: "RENT",
    periodYear: 2026,
    periodMonth: 9,
    installmentLabel: "Cuota 9/2026",
    dueDate: new Date("2026-09-10"),
    rentAmount: 650_000,
    expensesAmount: 45_000,
    contractServicesAmount: 0,
    lateFeeAmount: 0,
    otherAmount: 0,
    commissionAmount: 0,
    totalAmount: 695_000,
    paidAmount: 0,
    balance: 695_000,
    ordinaryExpenses: 0,
    extraordinaryExpenses: 0,
    servicesAmount: 0,
    servicesExtraordinaryAmount: 0,
    status: "PENDING",
    currency: "ARS",
    contractCode: "E2E-CTR-001",
    propertyTitle: "Depto E2E",
    ...partial,
  };
}

describe("openConceptMap", () => {
  it("desglosa alquiler y expensas ordinarias", () => {
    const map = openConceptMap(bill({}));
    assert.equal(map.rent, 650_000);
    assert.equal(map.ordinary, 45_000);
    assert.equal(
      map.rent + map.ordinary,
      695_000,
    );
  });

  it("cierra el saldo en Otros si hay diferencia", () => {
    const map = openConceptMap(
      bill({ balance: 700_000, otherAmount: 5_000 }),
    );
    const sum = Object.values(map).reduce((a, b) => a + b, 0);
    assert.equal(sum, 700_000);
  });

  it("expone etiquetas para todos los conceptos", () => {
    assert.ok(BILL_CONCEPT_LABEL.rent);
    assert.ok(BILL_CONCEPT_LABEL.lateFee);
  });
});
