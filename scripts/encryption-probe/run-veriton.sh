#!/bin/bash
# Run the vault probe in a headless Firefox on the Veriton and bring the result back: scripts/encryption-probe/run-veriton.sh <out.json>
# It starts only its own collector and its own Firefox profile, records both PIDs, and stops only those two. It does not touch any other browser on the machine.
set -u
OUT=${1:?usage: run-veriton.sh out.json}
HERE=$(cd "$(dirname "$0")" && pwd)
PORT=${PLC_PROBE_PORT:-18451}
TMP=$(mktemp -d)
node "$HERE/build-probe.mjs" "$TMP" >/dev/null || exit 1
ssh veriton "mkdir -p /tmp/plc-probe-claude && rm -f /tmp/plc-probe-claude/out.json && ss -ltn | grep -q ':$PORT ' && echo PORT-BUSY" | grep -q PORT-BUSY && { echo "port $PORT is busy on the Veriton; set PLC_PROBE_PORT"; exit 1; }
scp -q "$TMP/probe.html" "$HERE/collector.py" veriton:/tmp/plc-probe-claude/ || exit 1
ssh veriton "cd /tmp/plc-probe-claude && (nohup python3 collector.py $PORT /tmp/plc-probe-claude/out.json >collector.log 2>&1 & echo \$! > collector.pid) && mkdir -p ~/snap/firefox/common/plc-probe-profile && (nohup /snap/bin/firefox --headless --no-remote --profile ~/snap/firefox/common/plc-probe-profile http://127.0.0.1:$PORT/probe.html >ff.log 2>&1 & echo \$! > ff.pid)"
ssh veriton 'for i in $(seq 1 40); do [ -s /tmp/plc-probe-claude/out.json ] && break; sleep 2; done'
scp -q veriton:/tmp/plc-probe-claude/out.json "$OUT"
# stop exactly what was started here, after checking the command lines
ssh veriton 'for f in ff collector; do p=$(cat /tmp/plc-probe-claude/$f.pid 2>/dev/null); [ -n "$p" ] && ps -o args= -p $p | grep -q "plc-probe\|collector.py" && kill $p; done; sleep 2; ps -eo args | grep "plc-probe-profile" | grep -v grep | wc -l'
rm -rf "$TMP"
