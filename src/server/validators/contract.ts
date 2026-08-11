import {
  AdjustmentIndex,
  ContractStatus,
  Currency,
} from "@prisma/client";
import { z } from "zod";
import { COMMISSION_MODES } from "@/features/contracts/lib/commission";

function withPayerSum<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((v: z.infer<T>, ctx) => {
    const data = v as {
      commissionTenantPct?: number;
      commissionOwnerPct?: number;
    };
    const t = data.commissionTenantPct ?? 0;
    const o = data.commissionOwnerPct ?? 0;
    if (Math.abs(t + o - 100) > 0.05) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Los % de inquilino y propietario deben sumar 100.",
        path: ["commissionOwnerPct"],
      });
    }
  });
}

export const contractCreateSchema = withPayerSum(
  z
    .object({
      propertyId: z.string().min(1),
      ownerId: z.string().min(1),
      tenantId: z.string().min(1),
      guarantorIds: z.array(z.string().min(1)).max(5).default([]),
      startDate: z.string().min(1),
      endDate: z.string().min(1),
      initialRent: z.coerce.number().positive(),
      currency: z.nativeEnum(Currency).default(Currency.ARS),
      depositAmount: z.coerce.number().nonnegative().default(0),
      commissionMode: z.enum(COMMISSION_MODES).default("PERCENT_RENT"),
      commissionValue: z.coerce.number().nonnegative().default(0),
      commissionTenantPct: z.coerce.number().min(0).max(100).default(0),
      commissionOwnerPct: z.coerce.number().min(0).max(100).default(100),
      commissionInstallments: z.preprocess(
        (v) => (v === "" || v == null || v === undefined ? undefined : v),
        z.coerce.number().int().positive().optional(),
      ),
      lateFeeDailyRatePct: z.coerce.number().nonnegative().default(0),
      includesOrdinaryExp: z.coerce.boolean().optional(),
      includesExtraordExp: z.coerce.boolean().optional(),
      indexType: z.nativeEnum(AdjustmentIndex).default(AdjustmentIndex.ICL),
      periodMonths: z.coerce.number().int().positive().default(6),
      notes: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.commissionMode === "CONTRACT_TOTAL") {
        if (!(data.commissionValue > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Indicá el % de honorarios sobre el total del contrato.",
            path: ["commissionValue"],
          });
        }
        if (
          !data.commissionInstallments ||
          data.commissionInstallments < 1
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Indicá en cuántas cuotas se pagan los honorarios.",
            path: ["commissionInstallments"],
          });
        }
      }
    }),
);

export const contractUpdateSchema = withPayerSum(
  z.object({
    id: z.string().min(1),
    status: z.nativeEnum(ContractStatus),
    endDate: z.string().min(1),
    commissionMode: z.enum(COMMISSION_MODES),
    commissionValue: z.coerce.number().nonnegative(),
    commissionTenantPct: z.coerce.number().min(0).max(100),
    commissionOwnerPct: z.coerce.number().min(0).max(100),
    lateFeeDailyRatePct: z.coerce.number().nonnegative(),
    includesOrdinaryExp: z.coerce.boolean().optional(),
    includesExtraordExp: z.coerce.boolean().optional(),
    notes: z.string().optional(),
  }),
);

export { CONTRACT_STATUS_LABELS } from "@/lib/labels";
