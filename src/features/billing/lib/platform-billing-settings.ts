import { BRAND_LEGAL_NAME } from "@/lib/brand";
import { prisma } from "@/lib/prisma";

export type TransferBankDetails = {
  accountName: string;
  taxId: string;
  bankNameArs: string;
  cbuArs: string;
  aliasArs: string;
  bankNameUsd: string;
  accountUsd: string;
  notes: string;
};

export type MercadoPagoConfigPublic = {
  configured: boolean;
  fromEnv: boolean;
  tokenHint: string | null;
  publicKeyHint: string | null;
  webhookUrl: string;
  surchargePercent: number;
};

const SETTINGS_ID = "default";
const DEFAULT_MP_SURCHARGE_PERCENT = 4;

function maskSecret(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.length <= 8) return "••••••••";
  return `${"•".repeat(Math.min(12, v.length - 4))}${v.slice(-4)}`;
}

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3001"
  );
}

function envTransferDefaults(): TransferBankDetails {
  return {
    accountName:
      process.env.BILLING_TRANSFER_ACCOUNT_NAME?.trim() ||
      BRAND_LEGAL_NAME,
    taxId: process.env.BILLING_TRANSFER_TAX_ID?.trim() || "30-00000000-0",
    bankNameArs:
      process.env.BILLING_TRANSFER_BANK_ARS?.trim() || "Banco Galicia",
    cbuArs:
      process.env.BILLING_TRANSFER_CBU_ARS?.trim() || "0070000000000000000001",
    aliasArs:
      process.env.BILLING_TRANSFER_ALIAS_ARS?.trim() || "simpleinmo.pagos",
    bankNameUsd: process.env.BILLING_TRANSFER_BANK_USD?.trim() || "Cuenta USD",
    accountUsd:
      process.env.BILLING_TRANSFER_ACCOUNT_USD?.trim() ||
      "Configurar cuenta USD",
    notes:
      process.env.BILLING_TRANSFER_NOTES?.trim() ||
      "Indicá en el concepto tu email de registro.",
  };
}

function parseSurcharge(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MP_SURCHARGE_PERCENT;
  return Math.min(100, Math.round(n * 100) / 100);
}

async function ensureSettingsRow() {
  await prisma.platformBillingSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, mpSurchargePercent: DEFAULT_MP_SURCHARGE_PERCENT },
    update: {},
  });
}

export async function getMercadoPagoAccessToken(): Promise<string | null> {
  const row = await prisma.platformBillingSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  const fromDb = row?.mpAccessToken?.trim();
  if (fromDb) return fromDb;
  return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || null;
}

export async function getMercadoPagoConfigPublic(): Promise<MercadoPagoConfigPublic> {
  const row = await prisma.platformBillingSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  const dbToken = row?.mpAccessToken?.trim() || null;
  const envToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || null;
  const token = dbToken || envToken;
  return {
    configured: Boolean(token),
    fromEnv: Boolean(!dbToken && envToken),
    tokenHint: maskSecret(token),
    publicKeyHint: maskSecret(row?.mpPublicKey),
    webhookUrl: `${appBaseUrl()}/api/billing/mercadopago/webhook`,
    surchargePercent: parseSurcharge(row?.mpSurchargePercent),
  };
}

export async function getTransferBankDetailsEffective(): Promise<TransferBankDetails> {
  const env = envTransferDefaults();
  const row = await prisma.platformBillingSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return env;
  return {
    accountName: row.transferAccountName?.trim() || env.accountName,
    taxId: row.transferTaxId?.trim() || env.taxId,
    bankNameArs: row.transferBankNameArs?.trim() || env.bankNameArs,
    cbuArs: row.transferCbuArs?.trim() || env.cbuArs,
    aliasArs: row.transferAliasArs?.trim() || env.aliasArs,
    bankNameUsd: row.transferBankNameUsd?.trim() || env.bankNameUsd,
    accountUsd: row.transferAccountUsd?.trim() || env.accountUsd,
    notes: row.transferNotes?.trim() || env.notes,
  };
}

export async function upsertMercadoPagoSettings(input: {
  accessToken?: string | null;
  publicKey?: string | null;
  clearToken?: boolean;
  clearPublicKey?: boolean;
  surchargePercent?: number | null;
}): Promise<void> {
  await ensureSettingsRow();
  const current = await prisma.platformBillingSettings.findUnique({
    where: { id: SETTINGS_ID },
  });

  let mpAccessToken = current?.mpAccessToken ?? null;
  if (input.clearToken) mpAccessToken = null;
  else if (input.accessToken?.trim()) mpAccessToken = input.accessToken.trim();

  let mpPublicKey = current?.mpPublicKey ?? null;
  if (input.clearPublicKey) mpPublicKey = null;
  else if (input.publicKey?.trim()) mpPublicKey = input.publicKey.trim();

  await prisma.platformBillingSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      mpAccessToken,
      mpPublicKey,
      mpSurchargePercent:
        input.surchargePercent != null
          ? parseSurcharge(input.surchargePercent)
          : parseSurcharge(current?.mpSurchargePercent),
    },
  });
}

export async function upsertTransferBankSettings(input: {
  details: TransferBankDetails;
}): Promise<void> {
  const d = input.details;
  await ensureSettingsRow();
  await prisma.platformBillingSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      transferAccountName: d.accountName.trim() || null,
      transferTaxId: d.taxId.trim() || null,
      transferBankNameArs: d.bankNameArs.trim() || null,
      transferCbuArs: d.cbuArs.trim() || null,
      transferAliasArs: d.aliasArs.trim() || null,
      transferBankNameUsd: d.bankNameUsd.trim() || null,
      transferAccountUsd: d.accountUsd.trim() || null,
      transferNotes: d.notes.trim() || null,
    },
  });
}
