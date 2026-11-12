WITH staff_number_seed AS (
  SELECT
    e."id",
    (
      RPAD(
        UPPER(
          SUBSTRING(REGEXP_REPLACE(COALESCE(t."name", 'Business'), '[^A-Za-z]', '', 'g') FROM 1 FOR 2) ||
          SUBSTRING(REGEXP_REPLACE(COALESCE(e."firstName", '') || COALESCE(e."lastName", ''), '[^A-Za-z]', '', 'g') FROM 1 FOR 2)
        ),
        4,
        'X'
      )
    ) AS prefix,
    ROW_NUMBER() OVER (
      PARTITION BY
        e."tenantId",
        RPAD(
          UPPER(
            SUBSTRING(REGEXP_REPLACE(COALESCE(t."name", 'Business'), '[^A-Za-z]', '', 'g') FROM 1 FOR 2) ||
            SUBSTRING(REGEXP_REPLACE(COALESCE(e."firstName", '') || COALESCE(e."lastName", ''), '[^A-Za-z]', '', 'g') FROM 1 FOR 2)
          ),
          4,
          'X'
        )
      ORDER BY e."createdAt", e."id"
    ) AS sequence_no
  FROM "employees" e
  JOIN "tenants" t ON t."id" = e."tenantId"
  WHERE
    e."employeeNumber" IS NULL
    OR LENGTH(e."employeeNumber") > 10
    OR e."employeeNumber" !~ '^[A-Z]{4}[0-9]{1,6}$'
)
UPDATE "employees" e
SET "employeeNumber" = staff_number_seed.prefix || LPAD(staff_number_seed.sequence_no::text, 6, '0')
FROM staff_number_seed
WHERE e."id" = staff_number_seed."id";
