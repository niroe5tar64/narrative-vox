#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.voicevox.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found."
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" down
echo "VOICEVOX Engine stopped."
