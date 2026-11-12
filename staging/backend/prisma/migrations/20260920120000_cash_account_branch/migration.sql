ALTER TABLE "cash_accounts" ADD COLUMN IF NOT EXISTS "branchId" TEXT REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "cash_accounts_tenantId_branchId_idx" ON "cash_accounts"("tenantId", "branchId");

-- Recover a branch only when all assigned staff resolve to the same active branch.
WITH staff_branches AS (
  SELECT u."cashAccountId", b."id" AS "branchId"
  FROM "users" u
  JOIN LATERAL (
    SELECT ub."branchId" FROM "user_branches" ub
    JOIN "branches" b ON b."id" = ub."branchId" AND b."tenantId" = u."tenantId" AND b."isActive" = true
    WHERE ub."userId" = u."id"
    ORDER BY ub."isPrimary" DESC, ub."createdAt" ASC LIMIT 1
  ) assignment ON true
  JOIN "branches" b ON b."id" = assignment."branchId"
  WHERE u."cashAccountId" IS NOT NULL AND u."isActive" = true
), resolved AS (
  SELECT "cashAccountId", MIN("branchId") AS "branchId" FROM staff_branches
  GROUP BY "cashAccountId" HAVING COUNT(DISTINCT "branchId") = 1
)
UPDATE "cash_accounts" ca SET "branchId" = resolved."branchId"
FROM resolved JOIN "branches" b ON b."id" = resolved."branchId"
WHERE ca."id" = resolved."cashAccountId" AND ca."branchId" IS NULL AND ca."tenantId" = b."tenantId";

-- A single active branch is unambiguous for existing unassigned accounts.
WITH single_branch AS (
  SELECT "tenantId", MIN("id") AS "branchId" FROM "branches" WHERE "isActive" = true
  GROUP BY "tenantId" HAVING COUNT(*) = 1
)
UPDATE "cash_accounts" ca SET "branchId" = b."branchId" FROM single_branch b
WHERE ca."tenantId" = b."tenantId" AND ca."branchId" IS NULL;
