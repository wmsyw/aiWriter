#!/bin/sh
set -e

case "${APP_MODE:-web}" in
  web)
    echo "Starting aiWriter web server..."
    exec node server.js
    ;;
  worker)
    echo "Starting aiWriter background worker..."
    exec node worker/index.js
    ;;
  *)
    echo "Error: Unknown APP_MODE '${APP_MODE}'. Use 'web' or 'worker'."
    exit 1
    ;;
esac
