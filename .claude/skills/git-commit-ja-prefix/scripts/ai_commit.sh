#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ai_commit.sh [--validate-only]

Read a commit message from stdin.
Validate the first line as '<type>: <Japanese subject>' and run git commit.
Types: feat|fix|refactor|docs|style|test|chore|perf
EOF
}

validate_only=false

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" == "--validate-only" ]]; then
  validate_only=true
  shift
fi

if [[ $# -ne 0 ]]; then
  echo "Unexpected arguments: $*" >&2
  usage >&2
  exit 2
fi

message_file="$(mktemp)"
cleanup() {
  rm -f "$message_file"
}
trap cleanup EXIT

cat >"$message_file"

if [[ ! -s "$message_file" ]]; then
  echo "Commit message is empty." >&2
  exit 1
fi

first_line="$(sed -n '1p' "$message_file")"
type_pattern='^(feat|fix|refactor|docs|style|test|chore|perf):[[:space:]].+'

if ! printf '%s\n' "$first_line" | grep -Eq "$type_pattern"; then
  echo "Invalid summary format." >&2
  echo "Expected: <type>: <subject>" >&2
  echo "Allowed type: feat|fix|refactor|docs|style|test|chore|perf" >&2
  exit 1
fi

if ! python3 - "$first_line" <<'PY'
import re, sys
line = sys.argv[1]
pattern = re.compile(
    r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F\u30FC\u3005]')
sys.exit(0 if pattern.search(line) else 1)
PY
then
  echo "Summary must include Japanese characters." >&2
  exit 1
fi

if [[ "$validate_only" == "true" ]]; then
  echo "Commit message format is valid."
  exit 0
fi

if git diff --cached --quiet; then
  echo "No staged changes. Stage files before committing." >&2
  exit 1
fi

git commit -F "$message_file"
