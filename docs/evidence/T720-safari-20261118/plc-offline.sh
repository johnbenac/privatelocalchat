#!/bin/bash
# PLC real-Safari offline reopen (board T720). Runs ON the Mac. Never touches Wi-Fi: the owner switches it by hand.
# Method: /srv/praxes/patterns/safari-offline-reopen-with-the-owner-at-the-wifi-switch.md. Own tab, own marker: runner=plc-t720.
OUT=/tmp/plc-offline.out; : > $OUT
log(){ echo "$(date +%H:%M:%S) $*" >> $OUT; }
runjs(){ osascript - "$1" <<'AS' 2>&1
on run argv
  set js to read POSIX file (item 1 of argv) as «class utf8»
  tell application "Safari"
    repeat with d in every document
      try
        if URL of d contains "runner=plc-t720" then return do JavaScript js in d
      end try
    end repeat
    return "no marked tab"
  end tell
end run
AS
}
log "before start: $(runjs /tmp/plc-before.js)"; sleep 4
log "before: $(runjs /tmp/plc-read-before.js)"
log "mark: $(runjs /tmp/plc-mark.js)"
down=0
for i in $(seq 1 600); do
  if ping -c1 -t2 1.1.1.1 >/dev/null 2>&1; then down=0; else down=$((down+1)); fi
  [ $down -ge 2 ] && break
  sleep 1
done
if [ $down -lt 2 ]; then log "TIMEOUT"; say "Offline test timed out. Nothing was tested."; exit 0; fi
T_DOWN=$(date +%s); log "network DOWN at epoch $T_DOWN"; sleep 3
log "reload: $(runjs /tmp/plc-reload.js)"; sleep 14
log "probe start: $(runjs /tmp/plc-probe.js)"
sleep 12
log "probe: $(runjs /tmp/plc-read.js)"
log "preview start (offline): $(runjs /tmp/plc-preview.js)"; sleep 10
log "preview (offline): $(runjs /tmp/plc-read-preview.js)"
log "network went down at epoch $T_DOWN; DONE"
say "Offline test finished. You can turn Wi-Fi back on now."
