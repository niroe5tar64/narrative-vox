#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not in a git repository." >&2
  exit 1
fi

print_section() {
  printf '\n## %s\n' "$1"
}

print_section "status --short"
git status --short

print_section "diff --name-only"
git diff --name-only

print_section "diff --shortstat"
git diff --shortstat || true

print_section "diff --stat"
git diff --stat

print_section "diff --name-status"
git diff --name-status

print_section "diff --cached --name-only"
git diff --cached --name-only

print_section "diff --cached --shortstat"
git diff --cached --shortstat || true

print_section "diff --cached --stat"
git diff --cached --stat
