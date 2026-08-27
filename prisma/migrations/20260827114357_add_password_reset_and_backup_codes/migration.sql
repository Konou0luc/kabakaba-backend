/*
  Warnings:

  - You are about to drop the column `twoFaBackupCode` on the `WebUser` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "WebUser" DROP COLUMN "twoFaBackupCode",
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WebUserBackupCode" (
    "id" TEXT NOT NULL,
    "webUserId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebUserBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebUserPasswordReset" (
    "id" TEXT NOT NULL,
    "webUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebUserPasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebUserBackupCode_webUserId_idx" ON "WebUserBackupCode"("webUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WebUserPasswordReset_tokenHash_key" ON "WebUserPasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "WebUserPasswordReset_webUserId_idx" ON "WebUserPasswordReset"("webUserId");

-- CreateIndex
CREATE INDEX "WebUserPasswordReset_tokenHash_idx" ON "WebUserPasswordReset"("tokenHash");

-- AddForeignKey
ALTER TABLE "WebUserBackupCode" ADD CONSTRAINT "WebUserBackupCode_webUserId_fkey" FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebUserPasswordReset" ADD CONSTRAINT "WebUserPasswordReset_webUserId_fkey" FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
