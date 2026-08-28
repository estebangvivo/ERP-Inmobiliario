import { z } from "zod";
import { ServiceCostCategory } from "@prisma/client";

export const contractServiceItemSchema = z.object({
  category: z.nativeEnum(ServiceCostCategory),
  concept: z.string().min(1).max(120),
  amount: z.coerce.number().nonnegative(),
  paidBy: z.enum(["TENANT", "OWNER"]),
  active: z.coerce.boolean().optional().default(true),
});

export const contractServicesJsonSchema = z.array(contractServiceItemSchema);

export const addContractServiceSchema = z.object({
  contractId: z.string().min(1),
  category: z.nativeEnum(ServiceCostCategory),
  concept: z.string().min(1).max(120),
  amount: z.coerce.number().nonnegative(),
  paidBy: z.enum(["TENANT", "OWNER"]),
});

export const updateContractServiceSchema = z.object({
  id: z.string().min(1),
  amount: z.coerce.number().nonnegative(),
  paidBy: z.enum(["TENANT", "OWNER"]),
  scope: z.enum(["REST_OF_CONTRACT", "SINGLE_BILL"]),
  fromYear: z.coerce.number().int().optional(),
  fromMonth: z.coerce.number().int().min(1).max(12).optional(),
  tenantBillId: z.string().optional(),
});

export const removeContractServiceSchema = z.object({
  id: z.string().min(1),
});
