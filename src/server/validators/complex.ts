import { z } from "zod";

export const complexCreateSchema = z.object({
  name: z.string().min(2),
  address: z.string().min(3),
  city: z.string().min(2),
  province: z.string().optional(),
  description: z.string().optional(),
});

export const complexUpdateSchema = complexCreateSchema.extend({
  id: z.string().min(1),
});

export const unitCreateSchema = z.object({
  complexId: z.string().min(1),
  code: z.string().min(1),
  floor: z.string().optional(),
  ownershipCoefficient: z.coerce.number().positive().max(1),
  areaM2: z.coerce.number().positive().optional().or(z.literal("")),
  rooms: z.coerce.number().int().nonnegative().optional().or(z.literal("")),
  bathrooms: z.coerce.number().int().nonnegative().optional().or(z.literal("")),
});
