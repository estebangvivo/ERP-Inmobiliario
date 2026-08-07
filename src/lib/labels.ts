import type {
  AdjustmentIndex,
  BillStatus,
  ContractStatus,
  CostBearer,
  LeadStatus,
  OrganizationRole,
  PartyRole,
  PaymentMethod,
  PropertyStatus,
  SaleDealStage,
  SettlementStatus,
  WorkOrderStatus,
} from "@prisma/client";

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  ADMIN: "Administrador",
  AGENT: "Agente",
  OWNER: "Propietario",
  TENANT: "Inquilino",
  SUPPLIER: "Proveedor",
  VIEWER: "Solo lectura",
};

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  OWNER: "Propietario",
  TENANT: "Inquilino",
  GUARANTOR: "Garante",
};

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  EXPIRED: "Vencido",
  TERMINATED: "Rescindido",
  RENEWED: "Renovado",
};

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  DRAFT: "Borrador",
  AVAILABLE: "Disponible",
  RESERVED: "Reservada",
  RENTED: "Alquilada",
  SOLD: "Vendida",
  MAINTENANCE: "Mantenimiento",
  INACTIVE: "Inactiva",
};

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  OPEN: "Abierta",
  ASSIGNED: "Asignada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export const COST_BEARER_LABELS: Record<CostBearer, string> = {
  OWNER_DEDUCTIBLE: "Deducible propietario",
  TENANT: "Inquilino",
  AGENCY: "Agencia",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  CHECK: "Cheque",
  CARD: "Tarjeta",
  GATEWAY: "Pasarela",
  OTHER: "Otro",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  QUALIFIED: "Calificado",
  CONVERTED: "Convertido",
  CLOSED: "Cerrado",
};

export const SERVICE_COST_CATEGORY_LABELS: Record<
  import("@prisma/client").ServiceCostCategory,
  string
> = {
  WATER: "Agua",
  GAS: "Gas",
  ELECTRICITY: "Luz",
  MUNICIPAL: "Tasa municipal",
  WORKS: "Obras",
  OTHER: "Otro / ajuste",
};

export const SALE_DEAL_STAGE_LABELS: Record<SaleDealStage, string> = {
  LEAD: "Interés",
  NEGOTIATION: "Negociación",
  RESERVED: "Seña / reserva",
  SOLD: "Vendida",
  LOST: "Perdida",
};

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  PAID: "Pagada",
  CANCELLED: "Cancelada",
};

export const ADJUSTMENT_INDEX_LABELS: Record<AdjustmentIndex, string> = {
  IPC: "IPC",
  ICL: "ICL",
  CUSTOM_PERCENT: "% personalizado",
  FIXED: "Fijo",
};
