ALTER TABLE "user_permissions" ADD COLUMN IF NOT EXISTS "canViewHREmployeesForAttendance" BOOLEAN NOT NULL DEFAULT false;
