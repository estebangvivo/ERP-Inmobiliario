import {
  Currency,
  OperationType,
  PropertyStatus,
  PropertyType,
} from "@prisma/client";
import { z } from "zod";

export const propertyCreateSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  propertyType: z.nativeEnum(PropertyType),
  operationType: z.nativeEnum(OperationType),
  status: z.nativeEnum(PropertyStatus).default(PropertyStatus.DRAFT),
  price: z.coerce.number().positive(),
  rentPrice: z
    .union([z.literal(""), z.coerce.number().positive()])
    .optional(),
  currency: z.nativeEnum(Currency).default(Currency.ARS),
  rentCurrency: z
    .union([z.nativeEnum(Currency), z.literal("")])
    .optional()
    .transform((v): Currency | undefined =>
      v === "ARS" || v === "USD" || v === "EUR" ? v : undefined,
    ),
  address: z.string().min(3),
  city: z.string().min(2),
  province: z.string().optional(),
  rooms: z.coerce.number().int().nonnegative().optional().or(z.literal("")),
  bathrooms: z.coerce.number().int().nonnegative().optional().or(z.literal("")),
  areaM2: z.coerce.number().positive().optional().or(z.literal("")),
  amenities: z.string().optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  unitId: z.string().optional().or(z.literal("")),
  ownerId: z.string().optional().or(z.literal("")),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  listedPublic: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
}).superRefine((d, ctx) => {
  if (d.operationType === OperationType.BOTH) {
    if (typeof d.rentPrice !== "number" || d.rentPrice <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rentPrice"],
        message: "Indicá el precio de alquiler y el de venta.",
      });
    }
  }
});

export const propertyUpdateSchema = propertyCreateSchema.extend({
  id: z.string().min(1),
});

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  HOUSE: "Casa",
  APARTMENT: "Departamento",
  COMMERCIAL: "Comercial",
  LAND: "Terreno",
  OFFICE: "Oficina",
  OTHER: "Otro",
};

/** Tipos excluidos al vincular unidad (solo terrenos). */
export const EXCLUDED_COMPLEX_PROPERTY_TYPES: PropertyType[] = [
  PropertyType.LAND,
];

export const OPERATION_LABELS: Record<OperationType, string> = {
  RENT: "Alquiler",
  SALE: "Venta",
  BOTH: "Alquiler y venta",
};

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  DRAFT: "Borrador",
  AVAILABLE: "Disponible",
  RESERVED: "Reservada",
  RENTED: "Alquilada",
  SOLD: "Vendida",
  MAINTENANCE: "Mantenimiento",
  INACTIVE: "Inactiva",
};
