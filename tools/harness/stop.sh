#!/bin/sh
for pid in $(ps -eo pid,args | awk "/WebKitWebDriver --port=445[56]/ && !/awk/ {print \$1}"); do kill $pid; done
for pid in $(ps -eo pid,args | awk "/dbus-run-session -- WebKitWebDriver/ && !/awk/ {print \$1}"); do kill $pid; done
for pid in $(ps -eo pid,args | awk "/Xvfb :99/ && !/awk/ {print \$1}"); do kill $pid; done
