#!/usr/bin/env bash
set -euo pipefail

VOICEVOX_URL="${1:-http://voicevox-engine:50021}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl command not found."
  exit 1
fi

if VERSION="$(curl -fsS --max-time 5 "${VOICEVOX_URL}/version" 2>/dev/null)"; then
  echo "VOICEVOX Engine is reachable: ${VOICEVOX_URL}"
  echo "version=${VERSION}"
  exit 0
fi

if SPEAKERS="$(curl -fsS --max-time 5 "${VOICEVOX_URL}/speakers" 2>/dev/null)"; then
  echo "VOICEVOX Engine is reachable: ${VOICEVOX_URL}"
  echo "speakers payload bytes=$(printf "%s" "${SPEAKERS}" | wc -c | tr -d ' ')"
  exit 0
fi

echo "VOICEVOX Engine is not reachable: ${VOICEVOX_URL}"
exit 1
