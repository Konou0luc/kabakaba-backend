-- SUPER_ADMIN is not a valid application role. Before applying this migration,
-- any legacy User rows using SUPER_ADMIN must be migrated to an appropriate
-- WebUser account/role or another valid mobile role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUPER_ADMIN' AND enumtypid = '"UserRole"'::regtype)
     AND EXISTS (SELECT 1 FROM "User" WHERE "role"::text = 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Cannot remove SUPER_ADMIN while legacy users still use it. Migrate those users first.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUPER_ADMIN' AND enumtypid = '"UserRole"'::regtype) THEN
    ALTER TYPE "UserRole" RENAME TO "UserRole_old";
    CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STUDENT', 'VENDOR');
    ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING "role"::text::"UserRole";
    ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STUDENT';
    DROP TYPE "UserRole_old";
  END IF;
END $$;
