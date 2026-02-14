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
