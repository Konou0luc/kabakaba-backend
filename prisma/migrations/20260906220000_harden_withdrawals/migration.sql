-- Idempotent hardening migration: some deployments may already contain
-- these columns from an earlier security patch. PostgreSQL IF NOT EXISTS
-- keeps the migration safe to re-apply after a failed/rolled-back attempt.
ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "payoutReference" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "payoutRequestedAt" TIMESTAMP(3);
ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "payoutCompletedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Withdrawal_payoutReference_key" ON "Withdrawal"("payoutReference");
