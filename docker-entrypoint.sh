#!/bin/sh
set -e

# Run database migrations on first web container start
if [ "${APP_MODE:-web}" = "web" ]; then
  echo "Running database migrations..."
  npx prisma db push --skip-generate 2>/dev/null || echo "Migration skipped or failed (may already be up to date)"
fi

case "${APP_MODE:-web}" in
  web)
    echo "Starting aiWriter web server..."
    exec node server.js
    ;;
  worker)
    echo "Starting aiWriter background worker..."
    exec node --import tsx worker/index.js
    ;;
  *)
    echo "Error: Unknown APP_MODE '${APP_MODE}'. Use 'web' or 'worker'."
    exit 1
    ;;
esac
