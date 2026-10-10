# Окружение прогона харнесса: невидимый дисплей Xvfb :99, отдельные HOME/XDG/D-Bus — окна и данные Andre не трогаются.
# Использование: . tools/harness/env.sh   (A — рабочая папка прогона, по умолчанию ~/desktop-audit ДО подмены HOME)
export A="${A:-$HOME/desktop-audit}"
export DISPLAY=:99
export HOME="$A/home"
export XDG_CONFIG_HOME="$A/home/.config" XDG_DATA_HOME="$A/home/.local/share" XDG_CACHE_HOME="$A/home/.cache" XDG_STATE_HOME="$A/home/.local/state"
export XDG_RUNTIME_DIR="$A/run"
# fakebin первым: xdg-open/gio/… только пишут в logs/opener.log; root/usr — Xvfb, xdotool, WebKitWebDriver из deb без sudo
export PATH="$A/fakebin:$A/root/usr/bin:/usr/local/bin:/usr/bin:/bin"
export LD_LIBRARY_PATH="$A/root/usr/lib/x86_64-linux-gnu"
export TAURI_WEBVIEW_AUTOMATION=true
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export GDK_BACKEND=x11
export NO_AT_BRIDGE=1
export LANG=ru_RU.UTF-8
unset WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
