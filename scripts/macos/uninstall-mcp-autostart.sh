#!/bin/bash

set -euo pipefail

LABEL="com.wangheng.lanhu-mcp"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN" "$PLIST_PATH" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "已卸载 LaunchAgent: $LABEL"
