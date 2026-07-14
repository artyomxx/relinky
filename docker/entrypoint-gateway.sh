#!/bin/sh
set -e
cd /app

if [ -z "$RELINKY_ADMIN_HOST" ]; then
	echo "relinky: RELINKY_ADMIN_HOST is required when RELINKY_USE_GATEWAY=1 (e.g. admin.example.com)"
	exit 1
fi

# Prefer RELINKY_*; fall back to legacy names with a one-time warning.
if [ -n "${RELINKY_ADMIN_IP+x}" ]; then
	:
elif [ -n "${ADMIN_IP+x}" ]; then
	echo "relinky: ADMIN_IP is deprecated; use RELINKY_ADMIN_IP" >&2
	RELINKY_ADMIN_IP="$ADMIN_IP"
fi
export RELINKY_ADMIN_IP="${RELINKY_ADMIN_IP:-127.0.0.1}"

if [ -n "${RELINKY_REDIRECTOR_IP+x}" ]; then
	:
elif [ -n "${REDIRECTOR_IP+x}" ]; then
	echo "relinky: REDIRECTOR_IP is deprecated; use RELINKY_REDIRECTOR_IP" >&2
	RELINKY_REDIRECTOR_IP="$REDIRECTOR_IP"
fi
export RELINKY_REDIRECTOR_IP="${RELINKY_REDIRECTOR_IP:-127.0.0.1}"

if [ -n "${RELINKY_CADDYFILE_PATH+x}" ]; then
	:
elif [ -n "${CADDYFILE_PATH+x}" ]; then
	echo "relinky: CADDYFILE_PATH is deprecated; use RELINKY_CADDYFILE_PATH" >&2
	RELINKY_CADDYFILE_PATH="$CADDYFILE_PATH"
fi
export RELINKY_CADDYFILE_PATH="${RELINKY_CADDYFILE_PATH:-/app/caddy/Caddyfile}"

mkdir -p "$(dirname "$RELINKY_CADDYFILE_PATH")"

node /app/app/shared/init-db.js
node /app/scripts/generate-caddyfile.mjs

node /app/start.js &
APP_PID=$!

caddy run --config "$RELINKY_CADDYFILE_PATH" --adapter caddyfile &
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
