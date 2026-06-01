#!/bin/sh
set -e

echo "=== Backend Startup ==="
echo "Node: $(node --version)"
echo "Pwd: $(pwd)"
echo "Files: $(ls -la src/ 2>/dev/null || echo 'no src dir')"

# Run prisma migrations
echo "=== Running Prisma DB Push ==="
npx prisma db push --accept-data-loss --skip-generate 2>/dev/null || echo "Prisma push failed (non-fatal)"

echo "=== Seeding Database ==="
node prisma/seed.js 2>/dev/null || echo "Seed skipped (may already exist)"

# Start the app with full error output
echo "=== Starting Node App ==="
exec node --trace-warnings src/app.js

