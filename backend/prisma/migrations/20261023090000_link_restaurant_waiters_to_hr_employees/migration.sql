ALTER TABLE "waiters"
  ADD COLUMN IF NOT EXISTS "employeeId" TEXT;

CREATE INDEX IF NOT EXISTS "waiters_employeeId_idx" ON "waiters"("employeeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waiters_employeeId_fkey'
  ) THEN
    ALTER TABLE "waiters"
      ADD CONSTRAINT "waiters_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
