#!/bin/sh
set -e

echo "=== Backend Startup ==="
echo "Node: $(node --version)"
echo "Pwd: $(pwd)"
echo "=== Starting Node App ==="
exec node --trace-warnings src/app.js