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
japanese_pattern='[\p{Hiragana}\p{Katakana}\p{Han}ー々]'

if ! printf '%s\n' "$first_line" | grep -Eq "$type_pattern"; then
  echo "Invalid summary format." >&2
  echo "Expected: <type>: <subject>" >&2
  echo "Allowed type: feat|fix|refactor|docs|style|test|chore|perf" >&2
  exit 1
fi

if ! printf '%s\n' "$first_line" | grep -Pq "$japanese_pattern"; then
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
