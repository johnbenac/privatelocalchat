#!/usr/bin/env python3
"""Closed loop for a real-phone voice-call test: watch the diagnostics stream (dev-only, content-free), and each time the call
is listening, play the next recorded line through a speaker next to the phone. Prints a timeline of the call's own trace.
   python3 dev-tools/operator-call-loop.py [--turns 5] [--max-seconds 600] [--session-file F] [--play-host boiler] [--lines /tmp/plc-johnny-{n}.wav]
Needs: a diagnostics session (operator-session.py new --session-file F), the phone opened at /?diag=<id> in normal Safari
(Safari automation uses a mock microphone and cannot hear a speaker), and WAV lines on the play host."""
import argparse, json, subprocess, time, urllib.request
from pathlib import Path
ap = argparse.ArgumentParser(); ap.add_argument('--turns', type=int, default=5); ap.add_argument('--session-file', default='/root/.config/privatelocalchat/iphone-call-session.json'); ap.add_argument('--play-host', default='boiler'); ap.add_argument('--lines', default='/tmp/plc-johnny-{n}.wav', help='path of line N on the play host'); ap.add_argument('--max-seconds', type=int, default=600)
ap.add_argument('--settle', type=float, default=1.5, help='seconds to wait after "listening" before speaking')
args = ap.parse_args()
P = Path('/root/.config/privatelocalchat')
token = (P / 'debug-read-token').read_text().strip(); sid = json.loads(Path(args.session_file).read_text())['id']
URL = f'https://dev.privatelocal.chat/api/debug/admin/sessions/{sid}?recent=1'
def fetch():
    r = urllib.request.Request(URL, headers={'Authorization': 'Bearer ' + token, 'User-Agent': 'PrivateLocalChat-debug-operator'})
    return json.load(urllib.request.urlopen(r, timeout=30)).get('events', [])
def play(n):
    wav = args.lines.replace('{n}', str(n))  # played in the logged-in user's audio session: a root session has no speakers
    subprocess.Popen(['ssh', args.play_host, f'sudo -u johnb XDG_RUNTIME_DIR=/run/user/$(id -u johnb) pw-play {wav}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
seen, turn, started = set(), 0, time.time()
# only events from now on count: whatever happened before this run is history
for e in fetch(): seen.add(e['id'])
last_state, listening_since, waiting_reply, seen_reply, played_at = None, None, False, False, 0
print('watching; press the call button on the phone (the first line plays when the call is listening)', flush=True)
while time.time() - started < args.max_seconds and turn <= args.turns:
    try: evs = sorted(fetch(), key=lambda e: e['at'])
    except Exception as ex: print('read failed:', ex, flush=True); time.sleep(2); continue
    for e in evs:
        if e['id'] in seen: continue
        seen.add(e['id'])
        if e['type'] != 'call': continue
        d = e['data']; k = d.get('callKind')
        keep = {x: d[x] for x in ('state', 'reason', 'outcome', 'phase', 'heardChars', 'captionChars', 'sentenceChars', 'resultCount', 'durationMs', 'code', 'speaking', 'speechPending', 'visibility') if d.get(x) not in (None, '')}
        print(f"{e['at'][11:23]} +{d.get('sinceStartMs','?'):>6}ms {k:<17} {keep}", flush=True)
        if k == 'state':
            last_state = d.get('state')
            if last_state == 'listening':
                if not waiting_reply or seen_reply: listening_since = time.time()
                if waiting_reply and seen_reply: waiting_reply = False; seen_reply = False; print(f'--- turn {turn} complete: the call is listening again', flush=True)
            elif last_state in ('thinking', 'speaking'): listening_since = None; seen_reply = True
            elif last_state in ('error', 'paused', 'ended', 'idle'): print(f'--- call state {last_state}: stopping', flush=True); turn = args.turns + 1
    if last_state == 'listening' and listening_since and not waiting_reply and turn < args.turns and time.time() - listening_since >= args.settle:
        turn += 1; waiting_reply = True; seen_reply = False; listening_since = None; played_at = time.time()
        print(f'--- turn {turn}: playing line {turn}', flush=True); play(turn)
    if waiting_reply and time.time() - played_at > 120 and played_at:
        print(f'--- turn {turn}: 120 s with no progress (state {last_state}): the call looks hung', flush=True); played_at = 0
    time.sleep(1)
    if turn >= args.turns and not waiting_reply and last_state == 'listening': break
print('done', flush=True)
