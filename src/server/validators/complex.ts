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
  propertyId: z.string().min(1, "Elegí una propiedad."),
  ownershipCoefficient: z.coerce.number().positive().max(1),
});
