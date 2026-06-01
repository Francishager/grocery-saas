#!/bin/sh
echo "=== Backend Startup ==="
echo "Node: $(node --version)"
echo "Pwd: $(pwd)"
echo "=== Prisma DB Push ==="
npx prisma db push --accept-data-loss --skip-generate || echo "Prisma push failed"
echo "=== Seeding Database ==="
node prisma/seed.js || echo "Seed skipped"
echo "=== Starting Node App ==="
exec node --trace-warnings src/app.js