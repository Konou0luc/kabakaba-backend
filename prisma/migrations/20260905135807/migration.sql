/*
  Warnings:

  - You are about to drop the `WebUserPasswordReset` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "WebUserPasswordReset" DROP CONSTRAINT "WebUserPasswordReset_webUserId_fkey";

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT;

-- DropTable
DROP TABLE "WebUserPasswordReset";
