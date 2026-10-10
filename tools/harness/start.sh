#!/bin/sh
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/env.sh"
mkdir -p "$A/logs" "$A/shots" "$HOME/Загрузки" "$HOME/Документы" "$XDG_CONFIG_HOME" "$XDG_RUNTIME_DIR" "$A/fakebin"
chmod 700 "$XDG_RUNTIME_DIR"
printf 'XDG_DOCUMENTS_DIR="%s/Документы"\nXDG_DOWNLOAD_DIR="%s/Загрузки"\n' "$HOME" "$HOME" > "$XDG_CONFIG_HOME/user-dirs.dirs"
cp "$HERE"/fakebin/* "$A/fakebin/"
cp -n "$HERE"/data/* "$HOME/Загрузки/" 2>/dev/null || true
if [ -e "/tmp/.X${DISPLAY#:}-lock" ]; then echo "Display $DISPLAY already owned; choose TN_DISPLAY" >&2; exit 1; fi
nohup Xvfb "$DISPLAY" -screen 0 1920x1080x24 -nolisten tcp >"$A/logs/xvfb.log" 2>&1 &
echo $! > "$A/logs/xvfb.pid"
sleep 1
nohup dbus-run-session -- WebKitWebDriver --port="$TN_WEBDRIVER_PORT" >"$A/logs/webdriver.log" 2>&1 &
echo $! > "$A/logs/webdriver.pid"
sleep 1
kill -0 "$(cat "$A/logs/xvfb.pid")" "$(cat "$A/logs/webdriver.pid")"
echo "Audit $A; display $DISPLAY; WebDriver $TN_WEBDRIVER_PORT"
