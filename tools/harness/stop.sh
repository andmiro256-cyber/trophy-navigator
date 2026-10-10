#!/bin/sh
# Остановить окружение прогона: WebKitWebDriver, Xvfb :99 и шину at-spi, которую поднимает приложение в нашем
# XDG_RUNTIME_DIR ($A/run). Чужие процессы не трогаются.
A="${A:-$HOME/desktop-audit}"
for pid in $(ps -eo pid,args | awk "/WebKitWebDriver --port=445[56]/ && !/awk/ {print \$1}"); do kill $pid; done
for pid in $(ps -eo pid,args | awk "/dbus-run-session -- WebKitWebDriver/ && !/awk/ {print \$1}"); do kill $pid; done
for pid in $(ps -eo pid,args | awk "/Xvfb :99/ && !/awk/ {print \$1}"); do kill $pid; done
for pid in $(pgrep -f "at-spi-bus-launcher|at-spi2/accessibility.conf"); do
  tr '\0' '\n' < /proc/$pid/environ 2>/dev/null | grep -qx "XDG_RUNTIME_DIR=$A/run" && kill $pid
done
