-- CreateEnum
CREATE TYPE "SuspensionTrigger" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "SuspensionStatus" AS ENUM ('ACTIVE', 'LIFTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "isBanned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SuspensionEvent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "trigger" "SuspensionTrigger" NOT NULL,
    "ruleCode" TEXT,
    "reason" TEXT NOT NULL,
    "detectionMetadata" JSONB,
    "relatedAbuseLogId" TEXT,
    "status" "SuspensionStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedUntil" TIMESTAMP(3),
    "liftedAt" TIMESTAMP(3),
    "suspendedByUserId" TEXT,
    "suspendedByWebUserId" TEXT,
    "liftedByUserId" TEXT,
    "liftedByWebUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuspensionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuspensionEvent_studentId_idx" ON "SuspensionEvent"("studentId");

-- CreateIndex
CREATE INDEX "SuspensionEvent_suspendedAt_idx" ON "SuspensionEvent"("suspendedAt");

-- CreateIndex
CREATE INDEX "SuspensionEvent_status_idx" ON "SuspensionEvent"("status");

-- AddForeignKey
ALTER TABLE "SuspensionEvent" ADD CONSTRAINT "SuspensionEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspensionEvent" ADD CONSTRAINT "SuspensionEvent_relatedAbuseLogId_fkey" FOREIGN KEY ("relatedAbuseLogId") REFERENCES "AbuseLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
