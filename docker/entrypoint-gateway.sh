#!/bin/sh
set -e
cd /app

if [ -z "$RELINKY_ADMIN_HOST" ]; then
	echo "relinky: RELINKY_ADMIN_HOST is required when RELINKY_USE_GATEWAY=1 (e.g. admin.example.com)"
	exit 1
fi

export ADMIN_IP="${ADMIN_IP:-127.0.0.1}"
export REDIRECTOR_IP="${REDIRECTOR_IP:-127.0.0.1}"
export CADDYFILE_PATH="${CADDYFILE_PATH:-/app/caddy/Caddyfile}"

mkdir -p "$(dirname "$CADDYFILE_PATH")"

node /app/app/shared/init-db.js
node /app/scripts/generate-caddyfile.mjs

node /app/start.js &
APP_PID=$!

caddy run --config "$CADDYFILE_PATH" --adapter caddyfile &
CADDY_PID=$!

cleanup() {
	kill "$APP_PID" 2>/dev/null
	kill "$CADDY_PID" 2>/dev/null
	wait 2>/dev/null || true
	exit 0
}
trap cleanup TERM INT

wait "$APP_PID"
EXIT=$?
kill "$CADDY_PID" 2>/dev/null
wait "$CADDY_PID" 2>/dev/null || true
exit "$EXIT"
