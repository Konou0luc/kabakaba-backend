-- AlterTable
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);

-- Les comptes déjà créés ne repassent pas par l'écran de bienvenue.
UPDATE "User" SET "termsAcceptedAt" = "createdAt" WHERE "termsAcceptedAt" IS NULL;
