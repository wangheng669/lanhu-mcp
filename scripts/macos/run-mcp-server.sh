#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
VENV_DIR="$PROJECT_DIR/.venv"

mkdir -p "$LOG_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export PYTHONUNBUFFERED=1
export MCP_TRANSPORT="${MCP_TRANSPORT:-http}"
export SERVER_HOST="${SERVER_HOST:-127.0.0.1}"
export SERVER_PORT="${SERVER_PORT:-8000}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "未找到 Python 虚拟环境: $VENV_DIR/bin/python" >&2
  exit 1
fi

cd "$PROJECT_DIR"
exec "$VENV_DIR/bin/python" lanhu_mcp_server.py
