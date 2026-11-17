#!/bin/bash
# Run the vault probe in Chrome on an Android phone attached to Boiler and bring the result back: scripts/encryption-probe/run-android.sh <adb-serial> <out.json>
# The phone reaches the probe through `adb reverse` (so the page is on localhost, a secure context). Only this script's own collector, reverse port and tab are touched.
set -u
SERIAL=${1:?serial}; OUT=${2:?out.json}
HERE=$(cd "$(dirname "$0")" && pwd)
PORT=${PLC_PROBE_PORT:-18453}; DEVTOOLS=${PLC_DEVTOOLS_PORT:-19333}
TMP=$(mktemp -d); node "$HERE/build-probe.mjs" "$TMP" >/dev/null || exit 1
ssh boiler "mkdir -p /tmp/plc-probe-claude && rm -f /tmp/plc-probe-claude/out.json" || exit 1
scp -q "$TMP/probe.html" "$HERE/collector.py" boiler:/tmp/plc-probe-claude/ || exit 1
ssh boiler "cd /tmp/plc-probe-claude && (nohup python3 collector.py $PORT /tmp/plc-probe-claude/out.json >collector.log 2>&1 & echo \$! > collector.pid); adb -s $SERIAL reverse tcp:$PORT tcp:$PORT; adb -s $SERIAL forward tcp:$DEVTOOLS localabstract:chrome_devtools_remote; adb -s $SERIAL shell am start -a android.intent.action.VIEW -d http://localhost:$PORT/probe.html com.android.chrome"
ssh boiler 'for i in $(seq 1 45); do [ -s /tmp/plc-probe-claude/out.json ] && break; sleep 2; done'
scp -q boiler:/tmp/plc-probe-claude/out.json "$OUT"
# close only the probe tab (found by its address), then remove what was set up
ssh boiler "id=\$(curl -s -m 5 http://127.0.0.1:$DEVTOOLS/json/list | python3 -c 'import sys,json; print(next((t[\"id\"] for t in json.load(sys.stdin) if \"probe.html\" in t.get(\"url\",\"\")), \"\"))'); [ -n \"\$id\" ] && curl -s -m 5 http://127.0.0.1:$DEVTOOLS/json/close/\$id >/dev/null; adb -s $SERIAL forward --remove tcp:$DEVTOOLS; adb -s $SERIAL reverse --remove tcp:$PORT; p=\$(cat /tmp/plc-probe-claude/collector.pid); ps -o args= -p \$p | grep -q collector.py && kill \$p; echo cleaned"
rm -rf "$TMP"
