-- Keep industry-specific modules out of the standard seeded plans.
-- They remain available on Enterprise plans or through explicit tenant overrides.
WITH restricted_features AS (
  SELECT id
  FROM "features"
  WHERE replace(split_part(name, '.', 1), '-', '_') IN (
    'restaurant',
    'fuel_station',
    'manufacturing',
    'agriculture',
    'production',
    'service',
    'assets'
  )
)
DELETE FROM "plan_features" pf
USING "plans" p, restricted_features rf
WHERE pf."planId" = p.id
  AND pf."featureId" = rf.id
  AND p.slug IN ('freemium', 'starter', 'growth', 'professional');

UPDATE "plans" p
SET "features" = COALESCE(
  (
    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
    FROM jsonb_array_elements_text(p."features") WITH ORDINALITY AS item(value, ordinality)
    WHERE replace(split_part(item.value, '.', 1), '-', '_') NOT IN (
      'restaurant',
      'fuel_station',
      'manufacturing',
      'agriculture',
      'production',
      'service',
      'assets'
    )
  ),
  '[]'::jsonb
)
WHERE p.slug IN ('freemium', 'starter', 'growth', 'professional')
  AND jsonb_typeof(p."features") = 'array';
