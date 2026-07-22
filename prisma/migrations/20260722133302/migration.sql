-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AmbassadorStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WebUserDeletionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WebUserRole" AS ENUM ('SUPERVISION', 'ADMIN');

-- CreateEnum
CREATE TYPE "PartnerApplicationStatus" AS ENUM ('NEW', 'CONTACTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeDecision" AS ENUM ('REFUND', 'SUSPENSION_ADJUSTMENT', 'CLOSE_NO_ACTION');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- AlterTable
ALTER TABLE "Ambassador" ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "faculty" TEXT,
ADD COLUMN     "institution" TEXT,
ADD COLUMN     "lastReferralAt" TIMESTAMP(3),
ADD COLUMN     "schoolCardUrl" TEXT,
ADD COLUMN     "status" "AmbassadorStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "treatedByWebUserId" TEXT,
ADD COLUMN     "volume30d" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "promoCode" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AmbassadorCommission" ADD COLUMN     "affiliateId" TEXT,
ADD COLUMN     "commissionRate" DECIMAL(5,2),
ADD COLUMN     "levelApplied" "AmbassadorLevel";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "webUserId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspensionReason" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "bannerUrl" TEXT;

-- CreateTable
CREATE TABLE "WebUser" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "WebUserRole" NOT NULL DEFAULT 'ADMIN',
    "phone" TEXT,
    "avatarInitials" TEXT,
    "avatarColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFaSecret" TEXT,
    "twoFaBackupCode" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WebUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebUserDeletionRequest" (
    "id" TEXT NOT NULL,
    "targetWebUserId" TEXT NOT NULL,
    "initiatedByWebUserId" TEXT NOT NULL,
    "confirmedByWebUserId" TEXT,
    "reason" TEXT,
    "status" "WebUserDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "WebUserDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebUserSession" (
    "id" TEXT NOT NULL,
    "webUserId" TEXT NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "ipAddress" TEXT,
    "city" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "WebUserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebUserPreferences" (
    "id" TEXT NOT NULL,
    "webUserId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lome',
    "currencyFormat" TEXT NOT NULL DEFAULT 'FCFA',
    "defaultDashboardPeriod" TEXT NOT NULL DEFAULT '30d',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "priorityKpis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebUserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebUserNotificationSetting" (
    "id" TEXT NOT NULL,
    "webUserId" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebUserNotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacultyList" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacultyList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerApplication" (
    "id" TEXT NOT NULL,
    "structureName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "targetCampus" TEXT NOT NULL,
    "message" TEXT,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'NEW',
    "treatedByWebUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ticketAmount" INTEGER,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "decision" "DisputeDecision",
    "decisionNote" TEXT,
    "treatedByWebUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSchedule" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "day" "Weekday" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebUser_email_key" ON "WebUser"("email");

-- CreateIndex
CREATE INDEX "WebUser_email_idx" ON "WebUser"("email");

-- CreateIndex
CREATE INDEX "WebUser_role_idx" ON "WebUser"("role");

-- CreateIndex
CREATE INDEX "WebUserDeletionRequest_targetWebUserId_idx" ON "WebUserDeletionRequest"("targetWebUserId");

-- CreateIndex
CREATE INDEX "WebUserDeletionRequest_status_idx" ON "WebUserDeletionRequest"("status");

-- CreateIndex
CREATE INDEX "WebUserSession_webUserId_idx" ON "WebUserSession"("webUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WebUserPreferences_webUserId_key" ON "WebUserPreferences"("webUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WebUserNotificationSetting_webUserId_settingKey_key" ON "WebUserNotificationSetting"("webUserId", "settingKey");

-- CreateIndex
CREATE INDEX "FacultyList_campusId_idx" ON "FacultyList"("campusId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_studentId_idx" ON "Dispute"("studentId");

-- CreateIndex
CREATE INDEX "Dispute_vendorId_idx" ON "Dispute"("vendorId");

-- CreateIndex
CREATE INDEX "VendorSchedule_vendorId_idx" ON "VendorSchedule"("vendorId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- AddForeignKey
ALTER TABLE "Ambassador" ADD CONSTRAINT "Ambassador_treatedByWebUserId_fkey" FOREIGN KEY ("treatedByWebUserId") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_webUserId_fkey" FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebUserDeletionRequest" ADD CONSTRAINT "WebUserDeletionRequest_targetWebUserId_fkey" FOREIGN KEY ("targetWebUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebUserDeletionRequest" ADD CONSTRAINT "WebUserDeletionRequest_initiatedByWebUserId_fkey" FOREIGN KEY ("initiatedByWebUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebUserDeletionRequest" ADD CONSTRAINT "WebUserDeletionRequest_confirmedByWebUserId_fkey" FOREIGN KEY ("confirmedByWebUserId") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebUserSession" ADD CONSTRAINT "WebUserSession_webUserId_fkey" FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebUserPreferences" ADD CONSTRAINT "WebUserPreferences_webUserId_fkey" FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebUserNotificationSetting" ADD CONSTRAINT "WebUserNotificationSetting_webUserId_fkey" FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyList" ADD CONSTRAINT "FacultyList_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplication" ADD CONSTRAINT "PartnerApplication_treatedByWebUserId_fkey" FOREIGN KEY ("treatedByWebUserId") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_treatedByWebUserId_fkey" FOREIGN KEY ("treatedByWebUserId") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSchedule" ADD CONSTRAINT "VendorSchedule_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
