/*
  Warnings:

  - Added the required column `expiresAt` to the `WebUserDeletionRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "WebUserDeletionStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "WebUserDeletionRequest" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "WebUserDeletionApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebUserDeletionApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebUserDeletionApproval_requestId_approverId_key" ON "WebUserDeletionApproval"("requestId", "approverId");

-- AddForeignKey
ALTER TABLE "WebUserDeletionApproval" ADD CONSTRAINT "WebUserDeletionApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WebUserDeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebUserDeletionApproval" ADD CONSTRAINT "WebUserDeletionApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
