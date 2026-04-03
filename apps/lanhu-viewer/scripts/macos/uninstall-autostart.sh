#!/bin/bash

set -euo pipefail

LABEL="com.wangheng.lanhu-viewer"
DOMAIN="gui/$(id -u)"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "$DOMAIN" "$PLIST_PATH" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "已移除 LaunchAgent: $LABEL"
