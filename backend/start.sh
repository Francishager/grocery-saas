#!/bin/sh
set -e

echo "=== Backend Startup ==="
echo "Node: $(node --version)"
echo "Pwd: $(pwd)"
node src/scripts/ensure-sale-tax-schema.js
node src/scripts/ensure-branch-attendance-schema.js
node src/scripts/ensure-trash-schema.js
node src/scripts/ensure-property-management-feature.js
node src/scripts/ensure-property-tenancy-alternate-phone-schema.js
node src/scripts/ensure-property-rent-rate-history-schema.js
node src/scripts/ensure-property-rent-promises-schema.js
node src/scripts/ensure-payment-permissions-and-rent-mobile-schema.js
node src/scripts/ensure-rental-runtime-schema.js
node src/scripts/ensure-rental-mixed-booking-schema.js
node src/scripts/ensure-rental-historical-entry-schema.js
echo "=== Starting Node App ==="
exec node --trace-warnings src/app.js
