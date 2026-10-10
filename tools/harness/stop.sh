#!/bin/sh
# Only processes whose environment points to this audit directory.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/env.sh"
python3 - <<'PYCODE'
import os, signal
run = os.environ['XDG_RUNTIME_DIR'].encode()
for pid in os.listdir('/proc'):
    if not pid.isdigit() or int(pid) in (os.getpid(), os.getppid()): continue
    try:
        env = open('/proc/' + pid + '/environ', 'rb').read().split(b'\0')
        cmd = open('/proc/' + pid + '/cmdline', 'rb').read()
        if b'XDG_RUNTIME_DIR=' + run in env and any(x in cmd for x in (b'Xvfb', b'WebKit', b'dbus-', b'at-spi', b'trophy-navigator-desktop', b'gvfs')):
            os.kill(int(pid), signal.SIGTERM)
    except (OSError, PermissionError): pass
PYCODE
