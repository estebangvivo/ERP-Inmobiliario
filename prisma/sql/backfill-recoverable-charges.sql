-- Backfill: facturas AGENCY_RECOVERABLE pagadas sin RecoverableCharge
INSERT INTO recoverable_charges (
  id,
  "organizationId",
  "propertyId",
  "ownerId",
  "supplierInvoiceId",
  "workOrderId",
  amount,
  currency,
  "recoveredAmount",
  status,
  "openedAt",
  notes,
  "createdAt",
  "updatedAt"
)
SELECT
  'rc_' || substr(md5(si.id || po."ownerId"), 1, 24),
  wo."organizationId",
  wo."propertyId",
  po."ownerId",
  si.id,
  wo.id,
  ROUND((si.amount * po."sharePct" / 100)::numeric, 2),
  si.currency,
  0,
  'OPEN',
  COALESCE(si."paidAt", NOW()),
  'OT ' || wo.code || ' · ' || wo.title,
  NOW(),
  NOW()
FROM "SupplierInvoice" si
JOIN "WorkOrder" wo ON wo.id = si."workOrderId"
JOIN "PropertyOwnership" po ON po."propertyId" = wo."propertyId"
WHERE si."costBearer" = 'AGENCY_RECOVERABLE'
  AND si."paidAt" IS NOT NULL
  AND wo."organizationId" IS NOT NULL
  AND ROUND((si.amount * po."sharePct" / 100)::numeric, 2) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM recoverable_charges rc
    WHERE rc."supplierInvoiceId" = si.id
      AND rc."ownerId" = po."ownerId"
  );
