WITH employee_staff_prefix AS (
  SELECT
    e."id",
    e."tenantId",
    e."createdAt",
    LEFT(
      RPAD(
        UPPER(
          SUBSTRING(REGEXP_REPLACE(COALESCE(t."name", 'Business'), '[^A-Za-z]', '', 'g') FROM 1 FOR 2) ||
          SUBSTRING(REGEXP_REPLACE(COALESCE(e."firstName", '') || COALESCE(e."middleName", '') || COALESCE(e."lastName", ''), '[^A-Za-z]', '', 'g') FROM 1 FOR 3)
        ),
        5,
        'X'
      ),
      5
    ) AS prefix
  FROM "employees" e
  JOIN "tenants" t ON t."id" = e."tenantId"
),
renumbered_staff AS (
  SELECT
    "id",
    prefix,
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId"
      ORDER BY "createdAt", "id"
    ) AS sequence_no
  FROM employee_staff_prefix
)
UPDATE "employees" e
SET "employeeNumber" = renumbered_staff.prefix || LPAD(renumbered_staff.sequence_no::text, 5, '0')
FROM renumbered_staff
WHERE e."id" = renumbered_staff."id";
