-- CC paralela de gastos a recuperar (AGENCY_RECOVERABLE)
-- Aplicar con: psql "$DATABASE_URL" -f prisma/sql/recoverable-charges.sql
-- o: npx prisma db push

DO $$ BEGIN
  CREATE TYPE "RecoverableChargeStatus" AS ENUM ('OPEN', 'PARTIAL', 'RECOVERED', 'WRITTEN_OFF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecoverableRecoveryMethod" AS ENUM ('MANUAL', 'RECEIPT', 'SETTLEMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "recoverable_charges" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "supplierInvoiceId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" "Currency" NOT NULL DEFAULT 'ARS',
  "recoveredAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "RecoverableChargeStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recoverable_charges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recoverable_recoveries" (
  "id" TEXT NOT NULL,
  "chargeId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "recoveredAt" DATE NOT NULL,
  "method" "RecoverableRecoveryMethod" NOT NULL,
  "notes" TEXT,
  "receiptId" TEXT,
  "ownerSettlementId" TEXT,
  "referenceWorkOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recoverable_recoveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "recoverable_charges_supplierInvoiceId_ownerId_key"
  ON "recoverable_charges"("supplierInvoiceId", "ownerId");
CREATE INDEX IF NOT EXISTS "recoverable_charges_organizationId_ownerId_status_idx"
  ON "recoverable_charges"("organizationId", "ownerId", "status");
CREATE INDEX IF NOT EXISTS "recoverable_charges_organizationId_propertyId_status_idx"
  ON "recoverable_charges"("organizationId", "propertyId", "status");
CREATE INDEX IF NOT EXISTS "recoverable_charges_workOrderId_idx"
  ON "recoverable_charges"("workOrderId");

CREATE INDEX IF NOT EXISTS "recoverable_recoveries_chargeId_idx"
  ON "recoverable_recoveries"("chargeId");
CREATE INDEX IF NOT EXISTS "recoverable_recoveries_receiptId_idx"
  ON "recoverable_recoveries"("receiptId");
CREATE INDEX IF NOT EXISTS "recoverable_recoveries_ownerSettlementId_idx"
  ON "recoverable_recoveries"("ownerSettlementId");

DO $$ BEGIN
  ALTER TABLE "recoverable_charges"
    ADD CONSTRAINT "recoverable_charges_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recoverable_charges"
    ADD CONSTRAINT "recoverable_charges_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recoverable_charges"
    ADD CONSTRAINT "recoverable_charges_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recoverable_charges"
    ADD CONSTRAINT "recoverable_charges_supplierInvoiceId_fkey"
    FOREIGN KEY ("supplierInvoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recoverable_charges"
    ADD CONSTRAINT "recoverable_charges_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recoverable_recoveries"
    ADD CONSTRAINT "recoverable_recoveries_chargeId_fkey"
    FOREIGN KEY ("chargeId") REFERENCES "recoverable_charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recoverable_recoveries"
    ADD CONSTRAINT "recoverable_recoveries_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recoverable_recoveries"
    ADD CONSTRAINT "recoverable_recoveries_ownerSettlementId_fkey"
    FOREIGN KEY ("ownerSettlementId") REFERENCES "OwnerSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recoverable_recoveries"
    ADD CONSTRAINT "recoverable_recoveries_referenceWorkOrderId_fkey"
    FOREIGN KEY ("referenceWorkOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
