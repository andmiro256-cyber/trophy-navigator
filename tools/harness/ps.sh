#!/bin/sh
ps -eo pid,rss,args | grep -E "Xvfb :99|WebKitWebDriver|desktop-audit/app|WebKitWebProcess|WebKitNetworkProcess|dbus-daemon --config-file|dnd_src" | grep -v grep | cut -c1-140
