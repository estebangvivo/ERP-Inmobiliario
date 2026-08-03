import type { OrganizationRole } from "@prisma/client";
import { z } from "zod";
export { ROLE_LABELS } from "@/lib/labels";

export const organizationRoleEnum = z.enum([
  "ADMIN",
  "AGENT",
  "OWNER",
  "TENANT",
  "SUPPLIER",
  "VIEWER",
]);

export const userCreateSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  role: organizationRoleEnum,
  phone: z.string().optional(),
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
  bankAlias: z.string().optional(),
  bankCbu: z.string().optional(),
  bankName: z.string().optional(),
});

export const userUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email(),
  role: organizationRoleEnum,
  phone: z.string().optional(),
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
  bankAlias: z.string().optional(),
  bankCbu: z.string().optional(),
  bankName: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  password: z.string().min(6).optional().or(z.literal("")),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export type { OrganizationRole };
