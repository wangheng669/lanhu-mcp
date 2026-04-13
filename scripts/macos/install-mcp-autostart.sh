#!/bin/bash

set -euo pipefail

LABEL="com.wangheng.lanhu-mcp"
DOMAIN="gui/$(id -u)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
RUN_SCRIPT="$PROJECT_DIR/scripts/macos/run-mcp-server.sh"
LOG_DIR="$PROJECT_DIR/logs"
STDOUT_LOG="$LOG_DIR/mcp-launchd.out.log"
STDERR_LOG="$LOG_DIR/mcp-launchd.err.log"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUN_SCRIPT</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>PYTHONUNBUFFERED</key>
    <string>1</string>
    <key>MCP_TRANSPORT</key>
    <string>http</string>
    <key>SERVER_HOST</key>
    <string>127.0.0.1</string>
    <key>SERVER_PORT</key>
    <string>8000</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$STDOUT_LOG</string>
  <key>StandardErrorPath</key>
  <string>$STDERR_LOG</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST_PATH" >/dev/null
launchctl bootout "$DOMAIN" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap "$DOMAIN" "$PLIST_PATH"
launchctl enable "$DOMAIN/$LABEL"
launchctl kickstart -k "$DOMAIN/$LABEL"

echo "已安装并启动 LaunchAgent: $LABEL"
echo "配置文件: $PLIST_PATH"
echo "标准输出日志: $STDOUT_LOG"
echo "错误日志: $STDERR_LOG"
