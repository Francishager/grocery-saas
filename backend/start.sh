#!/bin/sh
set -e

echo "=== Backend Startup ==="
echo "Node: $(node --version)"
echo "Pwd: $(pwd)"
node src/scripts/run-locked-schema-bootstrap.js
echo "=== Starting Node App ==="
exec node --trace-warnings src/app.js
