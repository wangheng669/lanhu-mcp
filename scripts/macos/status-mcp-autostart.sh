#!/bin/bash

set -euo pipefail

LABEL="com.wangheng.lanhu-mcp"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

echo "LaunchAgent 文件: $PLIST_PATH"
launchctl print "$DOMAIN/$LABEL"
