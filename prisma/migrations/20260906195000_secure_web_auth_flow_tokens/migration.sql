-- Store temporary web-auth flow tokens server-side so onboarding, 2FA challenges
-- and password-reset tokens are single-use and cannot be replayed.
CREATE TABLE "WebAuthChallenge" (
    "id" TEXT NOT NULL,
    "webUserId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebAuthChallenge_webUserId_idx" ON "WebAuthChallenge"("webUserId");
CREATE INDEX "WebAuthChallenge_expiresAt_idx" ON "WebAuthChallenge"("expiresAt");
CREATE INDEX "WebAuthChallenge_purpose_consumedAt_idx" ON "WebAuthChallenge"("purpose", "consumedAt");

ALTER TABLE "WebAuthChallenge" ADD CONSTRAINT "WebAuthChallenge_webUserId_fkey"
  FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
