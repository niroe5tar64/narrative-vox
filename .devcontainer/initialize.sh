#!/bin/bash
set -e

# ホストマシン上でコンテナ作成前に必要なディレクトリを作成
# マウントに失敗しないよう、事前にディレクトリとファイルを確保

echo "Initializing host directories for DevContainer..."

# Git設定
if [ ! -f ~/.gitconfig ]; then
  echo "⚠️  ~/.gitconfig not found. Please configure Git before using DevContainer:"
  echo "   git config --global user.name 'Your Name'"
  echo "   git config --global user.email 'your.email@example.com'"
fi

# SSH鍵
if [ ! -d ~/.ssh ]; then
  echo "⚠️  ~/.ssh directory not found. Creating it..."
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
else
  echo "✅ ~/.ssh directory exists"
fi

# npm設定
if [ ! -f ~/.npmrc ]; then
  echo "ℹ️  ~/.npmrc not found. Creating empty file..."
  touch ~/.npmrc
else
  echo "✅ ~/.npmrc file exists"
fi

# Claude Code 設定ディレクトリ
mkdir -p ~/.claude/rules ~/.claude/ide ~/.claude/plans ~/.claude/todos ~/.claude/debug

# Claude Code 設定ファイル（空ファイルを作成）
touch ~/.claude/settings.json

# Codex 設定ディレクトリ
mkdir -p ~/.codex

# DevContainer と VOICEVOX Engine の共有ネットワーク
if command -v docker >/dev/null 2>&1; then
  if ! docker network inspect narrative-vox-net >/dev/null 2>&1; then
    echo "Creating docker network: narrative-vox-net"
    docker network create narrative-vox-net >/dev/null
  else
    echo "✅ docker network narrative-vox-net exists"
  fi
else
  echo "⚠️  docker command not found on host. Create network manually: docker network create narrative-vox-net"
fi

echo "✅ Host directories initialized successfully."
