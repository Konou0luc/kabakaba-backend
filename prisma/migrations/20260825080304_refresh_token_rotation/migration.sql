/*
  Warnings:

  - You are about to drop the column `balance` on the `WebUser` table. All the data in the column will be lost.
  - You are about to drop the column `payoutNumber` on the `WebUser` table. All the data in the column will be lost.
  - You are about to drop the column `payoutPercentage` on the `WebUser` table. All the data in the column will be lost.
  - You are about to drop the `Escrow` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PayrollRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PayrollRunEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PayrollSchedule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PlatformAccount` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WebUserWithdrawalRequest` table. If the table is not empty, all the data it contains will be lost.
  - The required column `familyId` was added to the `RefreshToken` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE "Escrow" DROP CONSTRAINT "Escrow_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Escrow" DROP CONSTRAINT "Escrow_studentId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollRun" DROP CONSTRAINT "PayrollRun_triggeredById_fkey";

-- DropForeignKey
ALTER TABLE "PayrollRunEntry" DROP CONSTRAINT "PayrollRunEntry_payrollRunId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollRunEntry" DROP CONSTRAINT "PayrollRunEntry_webUserId_fkey";

-- DropForeignKey
ALTER TABLE "WebUserWithdrawalRequest" DROP CONSTRAINT "WebUserWithdrawalRequest_processedById_fkey";

-- DropForeignKey
ALTER TABLE "WebUserWithdrawalRequest" DROP CONSTRAINT "WebUserWithdrawalRequest_webUserId_fkey";

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WebUser" DROP COLUMN "balance",
DROP COLUMN "payoutNumber",
DROP COLUMN "payoutPercentage";

-- DropTable
DROP TABLE "Escrow";

-- DropTable
DROP TABLE "PayrollRun";

-- DropTable
DROP TABLE "PayrollRunEntry";

-- DropTable
DROP TABLE "PayrollSchedule";

-- DropTable
DROP TABLE "PlatformAccount";

-- DropTable
DROP TABLE "WebUserWithdrawalRequest";

-- DropEnum
DROP TYPE "EscrowStatus";

-- DropEnum
DROP TYPE "PayrollScheduleFrequency";

-- DropEnum
DROP TYPE "PayrollTrigger";

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
