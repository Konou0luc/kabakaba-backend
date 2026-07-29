-- AlterEnum
ALTER TYPE "WithdrawalStatus" ADD VALUE 'PROCESSING';

-- DropIndex
DROP INDEX "PayrollRun_periodStart_periodEnd_key";
