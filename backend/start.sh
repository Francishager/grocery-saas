#!/bin/sh
set -e

echo "=== Backend Startup ==="
echo "Node: $(node --version)"
echo "Pwd: $(pwd)"
run_rental_schema_step() {
  script="$1"
  echo "=== Preparing rental schema: $script ==="
  if node "$script"; then
    echo "=== Rental schema ready: $script ==="
  else
    status=$?
    echo "WARNING: rental schema step $script exited with status $status; continuing so unrelated API routes remain available."
  fi
}
node src/scripts/ensure-sale-tax-schema.js
node src/scripts/ensure-branch-attendance-schema.js
node src/scripts/ensure-trash-schema.js
node src/scripts/ensure-property-management-feature.js
node src/scripts/ensure-property-tenancy-alternate-phone-schema.js
node src/scripts/ensure-property-rent-rate-history-schema.js
node src/scripts/ensure-property-rent-promises-schema.js
node src/scripts/ensure-property-tenant-notes-schema.js
node src/scripts/ensure-payment-permissions-and-rent-mobile-schema.js
node src/scripts/ensure-customer-credit-applications-schema.js
node src/scripts/ensure-customer-alternate-phone-schema.js
node src/scripts/ensure-user-theme-schema.js
node src/scripts/ensure-fractional-product-stock-schema.js
run_rental_schema_step src/scripts/ensure-rental-runtime-schema.js
run_rental_schema_step src/scripts/ensure-rental-mixed-booking-schema.js
run_rental_schema_step src/scripts/ensure-rental-historical-entry-schema.js
run_rental_schema_step src/scripts/ensure-rental-credit-notes-schema.js
run_rental_schema_step src/scripts/ensure-rental-credit-note-permissions-schema.js
run_rental_schema_step src/scripts/ensure-rental-cancellation-schema.js
echo "=== Preparing Salon & Spa schema ==="
node src/scripts/ensure-salon-spa-schema.js
echo "=== Preparing shared business membership schema ==="
node src/scripts/ensure-tenant-memberships-schema.js
echo "=== Preparing standalone Bar feature catalog ==="
node src/scripts/ensure-bar-feature.js
echo "=== Preparing Clinic & Pharmacy schema ==="
node src/scripts/ensure-clinic-pharmacy-schema.js
echo "=== Starting Node App ==="
exec node --trace-warnings src/app.js
