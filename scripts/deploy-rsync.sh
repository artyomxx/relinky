#!/usr/bin/env bash
# Rsync Relinky to a VPS and rebuild/restart Docker Compose (no git push required).
#
# Usage:
#   RELINKY_DEPLOY_SSH=user@host ./scripts/deploy-rsync.sh
#   ./scripts/deploy-rsync.sh user@host [remote-path-on-server]
#
# remote-path must be a path ON THE VPS (e.g. relinky or /home/you/relinky).
# Do NOT pass ~/relinky from your Mac — your shell expands it to /Users/you/relinky
# and rsync will try to create that path on the server (wrong).
#
# Env (optional):
#   RELINKY_DEPLOY_SSH    SSH target (default: first argument)
#   RELINKY_DEPLOY_PATH   Remote directory on server (default: second arg or ~/relinky via rsync)
#   RELINKY_COMPOSE_FILE  Compose file on server (default: docker-compose.gateway.yml)
#   RELINKY_DOCKER_NO_CACHE  Set to 1 for docker compose build --no-cache
#   RELINKY_REMOTE_DOCKER_SUDO  Set to 1 to run "sudo docker compose" on the server
#       (permission denied on /var/run/docker.sock otherwise). Prefer: sudo usermod -aG docker $USER
#   RELINKY_RSYNC_EXCLUDE_ENV  Set to 1 to skip copying .env (server keeps its existing file)
#
# .env: if ./.env exists locally, it is copied after the main sync (unless RELINKY_RSYNC_EXCLUDE_ENV=1).
# The main rsync always excludes .env so --delete does not remove the server’s .env when you have
# no local .env file.
#
# The remote parent directory must exist; ~/relinky is created on first rsync if you use ~/relinky.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_SSH="${RELINKY_DEPLOY_SSH:-${1:-}}"
COMPOSE_FILE="${RELINKY_COMPOSE_FILE:-docker-compose.gateway.yml}"

if [[ -z "$DEPLOY_SSH" ]]; then
	echo "Usage: RELINKY_DEPLOY_SSH=user@host $0"
	echo "   or: $0 user@host [remote-path]"
	exit 1
fi

REMOTE_PATH="${RELINKY_DEPLOY_PATH:-}"
if [[ -n "${2:-}" ]]; then
	REMOTE_PATH="$2"
fi

if [[ -z "$REMOTE_PATH" ]]; then
	RSYNC_REMOTE="~/relinky"
	REMOTE_CD='cd "$HOME/relinky"'
else
	if [[ "$REMOTE_PATH" == /Users/* ]] || [[ "$REMOTE_PATH" == /private/* ]]; then
		echo "deploy-rsync: \"$REMOTE_PATH\" looks like a path on your Mac, not the server." >&2
		echo "Use a path on the VPS, e.g.:  $0 $DEPLOY_SSH relinky" >&2
		echo "  (directory under remote login home, or e.g. /home/ubuntu/relinky)" >&2
		exit 1
	fi
	RSYNC_REMOTE="$REMOTE_PATH"
	REMOTE_CD=$(printf 'cd %q' "$REMOTE_PATH")
fi

COMP_Q=$(printf '%q' "$COMPOSE_FILE")
NOCACHE=""
if [[ "${RELINKY_DOCKER_NO_CACHE:-0}" == "1" ]]; then
	NOCACHE=" --no-cache"
fi

DOCKER=(docker)
if [[ "${RELINKY_REMOTE_DOCKER_SUDO:-0}" == "1" ]]; then
	DOCKER=(sudo docker)
fi

echo "==> Rsync to ${DEPLOY_SSH}:${RSYNC_REMOTE}/"
rsync -avz --delete \
	--exclude '.git/' \
	--exclude 'node_modules/' \
	--exclude 'db/' \
	--exclude '.env' \
	--exclude '.env.*' \
	--exclude '.DS_Store' \
	--exclude '.not-in-git/' \
	--exclude '*.swp' \
	--exclude '.idea/' \
	--exclude '.vscode/' \
	-e ssh \
	./ "${DEPLOY_SSH}:${RSYNC_REMOTE}/"

if [[ "${RELINKY_RSYNC_EXCLUDE_ENV:-0}" != "1" ]] && [[ -f "$ROOT/.env" ]]; then
	echo "==> Rsync .env"
	rsync -avz "$ROOT/.env" "${DEPLOY_SSH}:${RSYNC_REMOTE}/.env"
fi

echo "==> Docker compose: ${COMPOSE_FILE}"
REMOTE_DOCKER=$(printf '%q ' "${DOCKER[@]}")
# shellcheck disable=SC2029
ssh "$DEPLOY_SSH" "${REMOTE_CD} && ${REMOTE_DOCKER}compose -f ${COMP_Q} build${NOCACHE} && ${REMOTE_DOCKER}compose -f ${COMP_Q} up -d"

echo "==> Done."
