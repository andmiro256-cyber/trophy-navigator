#!/bin/sh
# Поднять Xvfb :99 и WebKitWebDriver на 4455 (W3C) для харнесса. Остановить — stop.sh, посмотреть — ps.sh.
# Приложение запускает сам WebDriver при создании сессии (wd.session(): binary = $A/app/cur/AppRun).
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/env.sh"
mkdir -p "$A/logs" "$A/shots" "$HOME/Загрузки" "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"
for f in "$HERE"/fakebin/*; do [ -e "$A/fakebin/$(basename "$f")" ] || { mkdir -p "$A/fakebin"; cp "$f" "$A/fakebin/"; }; done
cp -n "$HERE"/data/* "$HOME/Загрузки/" 2>/dev/null || true
if ! pgrep -f "Xvfb :99" >/dev/null; then
  nohup Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >"$A/logs/xvfb.log" 2>&1 &
  sleep 1
fi
if ! pgrep -f "WebKitWebDriver --port=4455" >/dev/null; then
  nohup dbus-run-session -- WebKitWebDriver --port=4455 >"$A/logs/webdriver.log" 2>&1 &
  sleep 1
fi
sh "$HERE/ps.sh"
