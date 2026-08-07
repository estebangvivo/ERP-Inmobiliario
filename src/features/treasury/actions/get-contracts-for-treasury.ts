"use server";

import { listContractsForTreasury } from "@/features/treasury/queries/list-contracts-for-treasury";

export async function getContractsForTreasuryAction() {
  return listContractsForTreasury();
}
