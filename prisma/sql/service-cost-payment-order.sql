-- Vincula ServiceCost con la OP emitida al cargar el gasto
ALTER TABLE "ServiceCost"
  ADD COLUMN IF NOT EXISTS "paymentOrderId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceCost_paymentOrderId_key"
  ON "ServiceCost"("paymentOrderId");

DO $$ BEGIN
  ALTER TABLE "ServiceCost"
    ADD CONSTRAINT "ServiceCost_paymentOrderId_fkey"
    FOREIGN KEY ("paymentOrderId") REFERENCES "payment_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
