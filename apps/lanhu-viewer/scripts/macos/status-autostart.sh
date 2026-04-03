#!/bin/bash

set -euo pipefail

LABEL="com.wangheng.lanhu-viewer"
DOMAIN="gui/$(id -u)"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -f "$PLIST_PATH" ]; then
  echo "未安装 LaunchAgent: $PLIST_PATH"
  exit 1
fi

echo "LaunchAgent 文件: $PLIST_PATH"
echo
launchctl print "$DOMAIN/$LABEL"
