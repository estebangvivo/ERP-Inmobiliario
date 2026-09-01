import type { BillDebtDetail } from "@/server/services/tenant-ledger";

export type BillConceptKey =
  | "rent"
  | "contractServices"
  | "ordinary"
  | "extraordinary"
  | "services"
  | "servicesExtraordinary"
  | "commission"
  | "lateFee"
  | "other";

export const BILL_CONCEPT_LABEL: Record<BillConceptKey, string> = {
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

export const BILL_CONCEPT_ORDER: BillConceptKey[] = [
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
export function openConceptMap(
  bill: BillDebtDetail,
): Record<BillConceptKey, number> {
  const raw: Record<BillConceptKey, number> = {
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
  const sum = round2(BILL_CONCEPT_ORDER.reduce((s, k) => s + raw[k], 0));

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
    const result = { ...raw };
    let allocated = 0;
    let lastKey: BillConceptKey = "other";
    for (const k of BILL_CONCEPT_ORDER) {
      if (result[k] > 0.001) lastKey = k;
    }
    for (const k of BILL_CONCEPT_ORDER) {
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
    const result: Record<BillConceptKey, number> = {
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
    const withAmount = BILL_CONCEPT_ORDER.filter((k) => raw[k] > 0.001);
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

  return {
    ...raw,
    other: round2(raw.other + (balance - sum)),
  };
}

export function conceptAmount(
  bill: BillDebtDetail,
  key: BillConceptKey,
): number {
  return openConceptMap(bill)[key];
}

export function conceptsForBill(bill: BillDebtDetail): BillConceptKey[] {
  return BILL_CONCEPT_ORDER.filter((key) => conceptAmount(bill, key) > 0.001);
}

function prorateLines(
  lines: { concept: string; amount: number }[],
  openAmount: number,
  fallbackLabel: string,
): { label: string; amount: number }[] {
  if (openAmount <= 0.001) return [];

  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  if (total <= 0.001 || lines.length === 0) {
    return [{ label: fallbackLabel, amount: round2(openAmount) }];
  }

  if (Math.abs(total - openAmount) <= 0.05) {
    return lines.map((l) => ({
      label: l.concept,
      amount: round2(l.amount),
    }));
  }

  const factor = openAmount / total;
  let allocated = 0;
  return lines.map((l, i) => {
    if (i === lines.length - 1) {
      return { label: l.concept, amount: round2(openAmount - allocated) };
    }
    const amt = round2(l.amount * factor);
    allocated = round2(allocated + amt);
    return { label: l.concept, amount: amt };
  });
}

export type BillDebtPrintLine = {
  label: string;
  amount: number;
};

export function buildBillDebtPrintLines(
  bill: BillDebtDetail,
  options: {
    contractServiceLines: { concept: string; amount: number }[];
    unitServiceLines: {
      concept: string;
      amount: number;
      type: "ORDINARY" | "EXTRAORDINARY";
    }[];
  },
): BillDebtPrintLine[] {
  const concepts = openConceptMap(bill);
  const lines: BillDebtPrintLine[] = [];

  if (concepts.rent > 0.001) {
    lines.push({ label: BILL_CONCEPT_LABEL.rent, amount: concepts.rent });
  }

  if (bill.kind === "SERVICES" && concepts.contractServices > 0.001) {
    lines.push(
      ...prorateLines(
        options.contractServiceLines,
        concepts.contractServices,
        BILL_CONCEPT_LABEL.contractServices,
      ),
    );
  }

  if (concepts.ordinary > 0.001) {
    lines.push({
      label: BILL_CONCEPT_LABEL.ordinary,
      amount: concepts.ordinary,
    });
  }

  if (concepts.extraordinary > 0.001) {
    lines.push({
      label: BILL_CONCEPT_LABEL.extraordinary,
      amount: concepts.extraordinary,
    });
  }

  if (concepts.services > 0.001) {
    const ordinaryServices = options.unitServiceLines.filter(
      (l) => l.type === "ORDINARY",
    );
    lines.push(
      ...prorateLines(
        ordinaryServices,
        concepts.services,
        BILL_CONCEPT_LABEL.services,
      ),
    );
  }

  if (concepts.servicesExtraordinary > 0.001) {
    const extraordinaryServices = options.unitServiceLines.filter(
      (l) => l.type === "EXTRAORDINARY",
    );
    lines.push(
      ...prorateLines(
        extraordinaryServices,
        concepts.servicesExtraordinary,
        BILL_CONCEPT_LABEL.servicesExtraordinary,
      ),
    );
  }

  if (concepts.commission > 0.001) {
    lines.push({
      label: BILL_CONCEPT_LABEL.commission,
      amount: concepts.commission,
    });
  }

  if (concepts.lateFee > 0.001) {
    lines.push({
      label: BILL_CONCEPT_LABEL.lateFee,
      amount: concepts.lateFee,
    });
  }

  if (concepts.other > 0.001) {
    lines.push({ label: BILL_CONCEPT_LABEL.other, amount: concepts.other });
  }

  return lines;
}
