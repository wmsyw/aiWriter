#!/bin/sh
set -e

if [ "${APP_MODE:-web}" = "web" ]; then
  echo "Running database migrations..."
  npx prisma db push --skip-generate || echo "Migration failed with exit code $?"
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
