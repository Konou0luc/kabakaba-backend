-- Manual withdrawal workflow: no provider payout is created.
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TYPE "WithdrawalAppealType" AS ENUM ('NOT_RECEIVED', 'AMOUNT_MISMATCH');
CREATE TYPE "WithdrawalAppealStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Withdrawal"
  ADD COLUMN "feeRetained" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "acceptedByWebUserId" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "confirmationDeadlineAt" TIMESTAMP(3),
  ADD COLUMN "autoConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByWebUserId" TEXT,
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "cancellationReason" TEXT;

CREATE TABLE "WithdrawalProof" (
  "id" TEXT NOT NULL,
  "withdrawalId" TEXT NOT NULL,
  "uploadedByWebUserId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WithdrawalProof_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WithdrawalAppeal" (
  "id" TEXT NOT NULL,
  "withdrawalId" TEXT NOT NULL,
  "type" "WithdrawalAppealType" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "WithdrawalAppealStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedByWebUserId" TEXT,
  "resolutionNote" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WithdrawalAppeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WithdrawalProof_withdrawalId_key" ON "WithdrawalProof"("withdrawalId");
CREATE INDEX "WithdrawalProof_uploadedByWebUserId_idx" ON "WithdrawalProof"("uploadedByWebUserId");
CREATE INDEX "WithdrawalAppeal_withdrawalId_status_idx" ON "WithdrawalAppeal"("withdrawalId", "status");
CREATE INDEX "WithdrawalAppeal_createdAt_idx" ON "WithdrawalAppeal"("createdAt");
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");
CREATE INDEX "Withdrawal_confirmationDeadlineAt_idx" ON "Withdrawal"("confirmationDeadlineAt");
CREATE INDEX "Withdrawal_vendorId_createdAt_idx" ON "Withdrawal"("vendorId", "createdAt");

ALTER TABLE "Withdrawal"
  ADD CONSTRAINT "Withdrawal_acceptedByWebUserId_fkey"
  FOREIGN KEY ("acceptedByWebUserId") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Withdrawal"
  ADD CONSTRAINT "Withdrawal_cancelledByWebUserId_fkey"
  FOREIGN KEY ("cancelledByWebUserId") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WithdrawalProof"
  ADD CONSTRAINT "WithdrawalProof_withdrawalId_fkey"
  FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WithdrawalProof"
  ADD CONSTRAINT "WithdrawalProof_uploadedByWebUserId_fkey"
  FOREIGN KEY ("uploadedByWebUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WithdrawalAppeal"
  ADD CONSTRAINT "WithdrawalAppeal_withdrawalId_fkey"
  FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WithdrawalAppeal"
  ADD CONSTRAINT "WithdrawalAppeal_resolvedByWebUserId_fkey"
  FOREIGN KEY ("resolvedByWebUserId") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
