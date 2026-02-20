#!/usr/bin/env bash
set -euo pipefail

NETWORK_NAME="narrative-vox-net"
COMPOSE_FILE="docker-compose.voicevox.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found."
  exit 1
fi

if ! docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  echo "Creating docker network: ${NETWORK_NAME}"
  docker network create "${NETWORK_NAME}" >/dev/null
fi

docker compose -f "${COMPOSE_FILE}" up -d

echo "VOICEVOX Engine is starting."
echo "Container URL (DevContainer): http://voicevox-engine:50021"
echo "Host URL: http://127.0.0.1:50021"

# Wait for engine to be ready, then sync user dictionary
echo "Waiting for VOICEVOX Engine to be ready..."
MAX_WAIT=30
WAITED=0
ENGINE_READY=false
while [ "$WAITED" -lt "$MAX_WAIT" ]; do
  if curl -s -o /dev/null -w '' http://127.0.0.1:50021/version 2>/dev/null; then
    ENGINE_READY=true
    break
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done

if [ "$ENGINE_READY" = true ]; then
  echo "Syncing user dictionary..."
  if bun src/cli/main.ts dict-sync; then
    echo "User dictionary synced successfully."
  else
    echo "[warning] User dictionary sync failed. Engine is running but dictionary may be out of date."
  fi
else
  echo "[warning] Engine did not become ready within ${MAX_WAIT}s. Skipping dictionary sync."
fi
