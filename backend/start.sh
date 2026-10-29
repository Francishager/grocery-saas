#!/bin/sh
set -e

echo "=== Backend Startup ==="
echo "Node: $(node --version)"
echo "Pwd: $(pwd)"
node src/scripts/ensure-sale-tax-schema.js
node src/scripts/ensure-branch-attendance-schema.js
node src/scripts/ensure-trash-schema.js
node src/scripts/ensure-property-management-feature.js
node src/scripts/ensure-property-rent-rate-history-schema.js
echo "=== Starting Node App ==="
exec node --trace-warnings src/app.js
