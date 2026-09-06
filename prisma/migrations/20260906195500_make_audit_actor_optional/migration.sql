-- Allow audit entries to be attributed to a WebUser without fabricating a User admin row.
ALTER TABLE "AuditLog" ALTER COLUMN "adminId" DROP NOT NULL;
