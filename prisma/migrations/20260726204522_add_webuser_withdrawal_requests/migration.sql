-- CreateTable
CREATE TABLE "WebUserWithdrawalRequest" (
    "id" TEXT NOT NULL,
    "webUserId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payoutNumber" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "fedapayPayoutId" TEXT,
    "rejectionReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,

    CONSTRAINT "WebUserWithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebUserWithdrawalRequest_webUserId_idx" ON "WebUserWithdrawalRequest"("webUserId");

-- CreateIndex
CREATE INDEX "WebUserWithdrawalRequest_status_idx" ON "WebUserWithdrawalRequest"("status");

-- AddForeignKey
ALTER TABLE "WebUserWithdrawalRequest" ADD CONSTRAINT "WebUserWithdrawalRequest_webUserId_fkey" FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebUserWithdrawalRequest" ADD CONSTRAINT "WebUserWithdrawalRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
