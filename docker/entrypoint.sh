#!/bin/sh
set -e
cd /app

if [ "$RELINKY_USE_GATEWAY" = "1" ]; then
	exec /bin/sh /app/docker/entrypoint-gateway.sh
fi

exec node /app/start.js
