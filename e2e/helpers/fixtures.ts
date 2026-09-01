import { readFileSync } from "node:fs";
import { join } from "node:path";

export type E2EFixtures = {
  contractCode: string;
  billId: string;
  billPeriodYear: number;
  billPeriodMonth: number;
  billTotalAmount: number;
  ownerName: string;
  ownerId: string;
  settlementPeriodYear: number;
  settlementPeriodMonth: number;
  bankAccountId: string;
  dailyCashBalanceBefore: number;
};

export function loadFixtures(): E2EFixtures {
  const path = join(process.cwd(), "e2e", ".fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as E2EFixtures;
}
