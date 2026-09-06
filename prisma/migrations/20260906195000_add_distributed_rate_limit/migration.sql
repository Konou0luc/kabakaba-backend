CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "throttlerName" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "totalHits" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key", "throttlerName", "windowStart")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
