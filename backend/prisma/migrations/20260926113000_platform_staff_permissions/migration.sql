ALTER TABLE "user_permissions" ADD COLUMN IF NOT EXISTS "platformPermissions" JSONB;
