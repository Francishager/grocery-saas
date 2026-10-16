INSERT INTO "features" ("id", "name", "displayName", "description", "module", "category", "isActive", "createdAt")
VALUES (
  'feature_communication_team_messaging',
  'communication.team_messaging',
  'Team Messaging',
  'Private in-app messages between active users in the same business',
  'communication',
  'integration',
  TRUE,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "plan_features" ("id", "planId", "featureId", "enabled", "createdAt")
SELECT
  SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 25),
  root."planId",
  messaging."id",
  root."enabled",
  CURRENT_TIMESTAMP
FROM "plan_features" root
JOIN "features" root_feature ON root_feature."id" = root."featureId" AND root_feature."name" = 'communication'
CROSS JOIN "features" messaging
WHERE messaging."name" = 'communication.team_messaging'
  AND root."enabled" = TRUE
ON CONFLICT ("planId", "featureId") DO NOTHING;

INSERT INTO "tenant_features" ("id", "tenantId", "featureId", "enabled", "createdAt", "updatedAt")
SELECT
  SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 25),
  existing."tenantId",
  messaging."id",
  existing."enabled",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenant_features" existing
JOIN "features" root_feature ON root_feature."id" = existing."featureId" AND root_feature."name" = 'communication'
CROSS JOIN "features" messaging
WHERE messaging."name" = 'communication.team_messaging'
ON CONFLICT ("tenantId", "featureId") DO NOTHING;
