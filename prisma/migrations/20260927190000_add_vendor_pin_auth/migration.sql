-- Authentification vendeur mobile par code PIN.
-- Le PIN remplace le mot de passe pour les connexions quotidiennes ; le mot de
-- passe (temporaire, fourni par l'admin) reste le secret de récupération
-- utilisé pour (ré)activer un PIN.
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "User" ADD COLUMN "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pinUpdatedAt" TIMESTAMP(3);
