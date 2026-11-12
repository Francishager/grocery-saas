INSERT INTO "features" ("id", "name", "displayName", "description", "module", "category", "isActive", "createdAt")
VALUES
  ('procurement_buyer_v1', 'procurement.buyer', 'Procurement · Buyer', 'Discover sellers, request quotes, place purchase orders, receive goods, and manage supplier relationships.', 'procurement', 'module', true, CURRENT_TIMESTAMP),
  ('procurement_seller_v1', 'procurement.seller', 'Supplier Marketplace · Seller', 'Publish offers, respond to buyer requests, fulfil orders, issue invoices, and manage buyer relationships.', 'procurement', 'module', true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Existing plans that included Procurement Network retain both workspaces.
INSERT INTO "plan_features" ("id", "planId", "featureId", "enabled", "createdAt")
SELECT 'pbuyer_' || md5(pf."planId"), pf."planId", buyer."id", pf."enabled", CURRENT_TIMESTAMP
FROM "plan_features" pf
JOIN "features" legacy ON legacy."id" = pf."featureId" AND legacy."name" = 'procurement.marketplace'
JOIN "features" buyer ON buyer."name" = 'procurement.buyer'
ON CONFLICT ("planId", "featureId") DO NOTHING;

-- Some plans also keep an explicit JSON allowlist in addition to PlanFeature rows.
UPDATE "plans"
SET "features" = "features"
  || CASE WHEN "features" @> '["procurement.buyer"]'::jsonb THEN '[]'::jsonb ELSE '["procurement.buyer"]'::jsonb END
  || CASE WHEN "features" @> '["procurement.seller"]'::jsonb THEN '[]'::jsonb ELSE '["procurement.seller"]'::jsonb END
WHERE jsonb_typeof("features") = 'array'
  AND "features" @> '["procurement.marketplace"]'::jsonb
  AND (NOT ("features" @> '["procurement.buyer"]'::jsonb) OR NOT ("features" @> '["procurement.seller"]'::jsonb));

INSERT INTO "plan_features" ("id", "planId", "featureId", "enabled", "createdAt")
SELECT 'pseller_' || md5(pf."planId"), pf."planId", seller."id", pf."enabled", CURRENT_TIMESTAMP
FROM "plan_features" pf
JOIN "features" legacy ON legacy."id" = pf."featureId" AND legacy."name" = 'procurement.marketplace'
JOIN "features" seller ON seller."name" = 'procurement.seller'
ON CONFLICT ("planId", "featureId") DO NOTHING;

-- Existing tenant overrides are copied too, including explicit disabled overrides.
INSERT INTO "tenant_features" ("id", "tenantId", "featureId", "enabled", "createdAt", "updatedAt")
SELECT 'tbuyer_' || md5(tf."tenantId"), tf."tenantId", buyer."id", tf."enabled", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenant_features" tf
JOIN "features" legacy ON legacy."id" = tf."featureId" AND legacy."name" = 'procurement.marketplace'
JOIN "features" buyer ON buyer."name" = 'procurement.buyer'
ON CONFLICT ("tenantId", "featureId") DO NOTHING;

INSERT INTO "tenant_features" ("id", "tenantId", "featureId", "enabled", "createdAt", "updatedAt")
SELECT 'tseller_' || md5(tf."tenantId"), tf."tenantId", seller."id", tf."enabled", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenant_features" tf
JOIN "features" legacy ON legacy."id" = tf."featureId" AND legacy."name" = 'procurement.marketplace'
JOIN "features" seller ON seller."name" = 'procurement.seller'
ON CONFLICT ("tenantId", "featureId") DO NOTHING;
