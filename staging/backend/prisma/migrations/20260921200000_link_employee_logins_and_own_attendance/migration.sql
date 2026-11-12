ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "userId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "employees_userId_key" ON "employees"("userId");
ALTER TABLE "user_permissions" ADD COLUMN IF NOT EXISTS "canRecordOwnHRAttendance" BOOLEAN NOT NULL DEFAULT false;