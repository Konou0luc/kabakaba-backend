-- Security hardening: make escrow release an explicit, one-time state on Order.
ALTER TABLE "Order"
ADD COLUMN "escrowReleasedAt" TIMESTAMP(3);

-- Backfill orders for which an ESCROW_RELEASE transaction already exists.
-- This prevents a legacy released order from being treated as releasable again.
UPDATE "Order" o
SET "escrowReleasedAt" = r."releasedAt"
FROM (
  SELECT "relatedOrderId", MAX("createdAt") AS "releasedAt"
  FROM "Transaction"
  WHERE "type" = 'ESCROW_RELEASE'
    AND "relatedOrderId" IS NOT NULL
  GROUP BY "relatedOrderId"
) r
WHERE o."id" = r."relatedOrderId"
  AND o."escrowReleasedAt" IS NULL;

CREATE INDEX "Order_escrowReleasedAt_idx" ON "Order"("escrowReleasedAt");
