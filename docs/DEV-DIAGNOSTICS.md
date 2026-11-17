# Development diagnostics

This module is maintained on `dev`. It is built and activated only for `dev.privatelocal.chat`.
The production build excludes the UI, modules, receiver worker, routes, and debug host hooks,
even if this source is later promoted to `main`. Tests inspect both build outputs.

Entering an HTTPS receiver URL immediately enables streaming. The URL and disk-saving choice
persist across reloads and browser restarts. There is no separate Start button or automatic
turnoff. Clear the URL to stop; saved events remain available for export or later upload.
Every event triggers an immediate upload attempt. Active loading and generation are sampled
up to four times per second, with one-second idle sampling. Numeric runtime memory requests
are coalesced so a slow provider cannot accumulate pending probes. Conversation content is excluded unless full-content capture is explicitly enabled locally or
by the authorized session owner. API settings and authorization headers are excluded. State transitions, timing, numeric memory, download progress,
filtered construction logs and page lifecycle events are recorded.

With local saving enabled, events are committed to IndexedDB before load/generation actions.
The bounded queue survives offline operation and page reopening. Events upload in batches when
connectivity returns and are removed only after acknowledgement. A failed upload keeps them.
The queue is bounded to 2,000 events, approximately 4 MB maximum plus an optional 1 MiB native ring; metadata is dropped before conversation frames when full. Content loss is counted and reported;
this bounded journal cannot guarantee retention when storage is full or the OS kills a pending write. Browser storage may still be evicted or unavailable. An OS process kill cannot emit a
final event; the last committed events provide the lead-up, and the next page-start marks a new
page session. Memory metrics are observations, not a confirmed OS termination diagnosis.

The optional project receiver uses a private R2 bucket, `privatelocalchat-debug-private`, bound
only to the development Pages project as `DEBUG_LOGS`. The operator read/admin credential is the
Pages secret `DEBUG_READ_TOKEN`, with its local copy outside Git at
`/root/.config/privatelocalchat/debug-read-token`. Sessions use random write-capability URLs and
remain active until explicitly revoked by an authenticated operator DELETE request. Read access requires the separate operator credential. Other HTTPS
receivers may be used if they accept the documented JSON batch format and appropriate CORS.

The panel is in **Settings > Models**, after "Details and repair" ("Development diagnostics"; expand it). A tester can also open `https://dev.privatelocal.chat/?diag=<session id>` (the UUID the receiver URL ends with): that fills in this site's own receiver and nothing else, so no long URL has to be typed on a phone. `tests/e2e/dev-diagnostics-panel.e2e.mjs` (run with `PLC_E2E_BRANCH=dev`) checks both; the panel was once lost for weeks when the model panel it was anchored to was removed, because only the dev site has it.

Create a session with `python dev-tools/operator-session.py new`; give the returned receiver URL
to the tester. Fetch saved server events with `python dev-tools/operator-session.py read --out
work/evidence/iphone-session.json`. Entering a receiver URL enables diagnostics; devices without a URL send no events.
The receiver and administrator endpoints return 404 on hosts other than the exact development
hostname. The production project has no diagnostic bucket binding or receiver worker.

When both a receiver and local saving are enabled, the 2B runtime also enables its existing
fixed-size native construction journal for that model session. It records and flushes numeric
PRE/POST boundaries in the native worker before dangerous operations. After a page restart,
dev recovers the latest 64 valid records before the next user-initiated load and uploads them
through the normal acknowledged queue. Recovery never clears or overwrites the ring. The
reader checks record size, magic, schema and CRC; torn records are ignored. It does not poll
the ring during construction. Clearing the URL stops uploads; an already-running native
recorder ends with its model-worker session. These hooks are stripped from production output.

Native counters are allocation/logical proxies, not process RSS or an iOS memory-limit
measurement. Raw payload slots have phase-dependent meanings; operation and phase codes are
preserved so a retained-generation receipt is not mistaken for a construction allocation.
Source counters can be historical after release; interpret them alongside release markers.

Use `operator-session.py read --recent` for the newest bounded stream window during live
testing. Full reads follow all historical pages. Timestamp-ordered batch keys keep recent
reads independent of session length; retrying an identical batch overwrites the same object.

The desktop receipt in `docs/evidence/dev-native-journal.json` records real inference,
forced renderer-crash recovery and a live receiver acknowledgement. It also confirms zero
retained model-source handles and late reads after release, with one bounded native
checkpoint. Those findings apply to the tested desktop run, not an iPhone reliability claim.

Recovery also runs when a receiver/local-saving choice is first configured and before a
subsequent model load. Concurrent recovery requests share one promise. Transient OPFS lock
errors receive bounded backoff; exhausted reads produce a diagnostic failure event instead
of being silently classified as a missing journal. The construction-crash receipt includes
an unfinished Wasm initialization PRE recovered and verified at the receiver after restart.

The same native ring also records sparse generation fences (phase 10): operation 1 before
generation, 2 at streamed-chunk counts 1/16/64/128/256/512, 3 on completion, and 4 on failure
or cancellation. Each fence flushes before the next inference step. Slot 176 is chunk count;
slots 184/192/200 carry the retained runtime's post-ready GPU-buffer bytes/count and pipeline
count. These are instrumented allocation counters, not resident memory. No prompt or reply
text enters the native ring. The generation hooks are stripped from production builds.

`docs/evidence/dev-long-generation.json` records two real 512-token completions, constant
Wasm capacity, bounded checkpoint replacement, cancellation followed by a successful reply,
and received native generation milestones. Zero GPU creation counters do not rule out
allocations outside the instrumented sites or a browser-process memory problem.

A dev-only compatibility runtime adds the native phase 11/12 tail fences documented in
`ops/native/README.md`. Its artifact pins are checked during build. Production retains the
original native runtime hashes. These markers help localize the observed iPhone restart;
they are not a claim that the restart has been fixed.

The current development iPhone experiment requests zero GPU-offloaded model layers.
The native runtime still keeps some weights on GPU. It reuses the same full 2B model
files and context, increases CPU/WebAssembly memory, and can be substantially slower.
The setting is applied only by the development diagnostics module on an iPhone/iPad
user agent. Production builds exclude this module. Desktop Chromium checks of this
configuration validate plumbing and native execution; they do not emulate WebKit or
establish iPhone survival. Measurements and limitations are recorded in
[evidence/dev-model-placement.json](evidence/dev-model-placement.json).

The development compiler-control candidate preserves that placement profile and
adds a separate runtime variant and Wasm SHA-256 to `version.json`, the diagnostics
panel, and startup/configuration events. These identifiers distinguish transformed
bytes that retain the baseline native build string. See the
[living investigation](IPHONE-INVESTIGATION.md) for qualification and rollout status.
The compiler experiment preserved sampling and content policy. The subsequent E03 observability
change adds opt-in content capture and commands, as described below.

## Full conversation capture and two-way control

These features are development-only. Existing sessions remain metadata-only until the tester
checks the content box or the authorized owner enables content for that specific session.
Full capture includes the selected saved chat, provider request, exact native inference request,
every native streamed chunk and terminal response/usage. Native chunks are not necessarily one
token each. Capture does not change the model, sampling, output limit or GPU placement.

Objects are JSON encoded, split into bounded frames, assigned a SHA-256 and persisted before
upload when local saving is enabled. Reassembly verifies the digest and reports missing frames;
counts alone are not proof of complete text. Individual objects above 1 MiB report an explicit
capture error. Offline frames remain queued for acknowledged upload after reconnecting.

The remote-control box also enables content capture. The session owner can use
`operator-session.py control-on --session-file PRIVATE_FILE` for the explicitly authorized
receiver. Clear the URL or uncheck remote control to revoke device execution. The operator can
also use `control-off`; the device learns that revocation on its next successful poll. A custom
receiver must implement this policy, command and receipt protocol to support control.

`operator-control.py` supports state, new-chat, download, cancel-download, load, unload, profile, prompt and stop. Commands
require the expected full deployment commit and expire after 30 minutes. Prompts use the normal
local chat path; they cannot execute arbitrary JavaScript or access unrelated apps. Profile
changes accept GPU layers 0 or -1 and require the model to be unloaded. They are explicit
experiments, not automatic recovery. Unsaved drafts and existing conversations are preserved.

A server-side conditional claim assigns each command to one page, and a durable device ledger
prevents replay. A claimed command interrupted by a page replacement is reported as interrupted,
not automatically retried. Stop and state remain available during generation. Terminal receipts
refer to captured result objects. Use a separate receiver session for each independently
controlled browser to avoid competing consumers.

Read raw events into ignored `work/` files, then run
`node dev-tools/decode-conversations.mjs INPUT OUTPUT` to reconstruct private objects. Keep
receiver URLs, raw prompts/replies, command files and device identifiers out of Git. Public
evidence contains only build identities, counts, timings, checks and limitations.

Diagnostic storage opens and transactions have bounded deadlines. If IndexedDB stalls, the
channel continues with a bounded memory queue and reports that local saving is unavailable.
It periodically retries storage. This fallback cannot survive page loss while offline. Existing
version-1 journals are read without forcing a schema upgrade; retention also works without the
new optional index. A late database open is closed, preventing leaked connections after timeout.

The device refreshes receiver policy while diagnostics are active, including after reconnecting.
An authorized owner can enable controls after the URL was entered, without asking for a reload.
Local opt-outs still take precedence. A completed `download` command receipt means the durable
download request was registered; inspect `state.downloadRecovery` and `state.model` for actual
progress and Ready. Downloads reuse the normal resumable installer and automatically load once
complete. `cancel-download` clears the request and keeps verified files. Already-installed files
are not downloaded again. These controls are stripped from production with the other dev hooks.

For USB testing, run `operator-device-storage.py` with a trusted Mac SSH target or an existing
local usbmux socket before a model download. It requires `pymobiledevice3` in the operator's
Python environment and existing device trust; it does not request new pairing or install device
software. The helper reads exactly one USB device, checks `AmountDataAvailable`, and exits 2
below the requested reserve (3 GiB by default). Missing immediate metrics fail closed. Its
short-lived SSH forward and device connection are closed on success or failure. The value is
an advisory observation, not a guarantee that subsequent writes succeed. Do not substitute
`TotalDataAvailable` or a browser's origin quota for immediately writable device storage.
Run its regression checks with `python3 -m unittest discover -s dev-tools/tests -v`.

Receiver-derived content/control grants belong to that receiver URL. Changing the URL clears
those grants and stops an in-flight upload; retained content waits for the new receiver's
content grant. An explicit local checkbox choice stays remembered across URL changes.

## Scoped network-denial testing

Development builds include a service-worker fault injector for unattended USB checks. It is
removed from production output. A same-origin page on the exact development hostname can send
`{type: 'dev-network-fault', enabled: true}` to its service-worker controller through a
`MessageChannel`; wait for the channel's acknowledgement before beginning a trial. Send the
same message with `enabled: false` and await acknowledgement to restore transport.

The setting survives worker restart and page navigation in that origin's storage. While active,
cache hits remain available, cached navigation returns the app shell, and cache misses and
POST requests return a network error. Diagnostic events must queue locally until restoration.
The operator should use USB to restore transport before ending the trial. This does not change
phone radios, `navigator.onLine`, or browser-internal update traffic; report it as scoped
application network denial, not an airplane-mode test. The [browser receipt](evidence/dev-offline-fault-harness.json)
verifies failure of app/CDN misses and diagnostic POSTs, cached navigation after worker restart,
and successful restoration against an actual HTTPS test server. Physical-device use is pending.

## USB process-footprint sampling

`operator-device-memory.py` uses the existing trusted USB connection and an in-process RSD
tunnel to read iOS Instruments process samples. It does not change phone radios or Mac
interfaces, install software on the device, or establish a new trust relationship. Run it
with the optional device-tools Python environment, an existing `--usbmux-socket`, the private
`--pairing-cache`, and `--out work/evidence/<trial>-memory-private.jsonl`. Set `--duration-seconds`
(default 600, maximum 3600), `--interval-ms` (default 1000), and optional repeated `--pid` filters.

Only MobileSafari and WebContent process identity and selected numeric metrics are written.
The journal is capped at 20 MB and flushed as samples arrive; its connections/tunnel close
on completion or failure. Timestamps are host receive times. Physical footprint, resident
bytes and compressed bytes are distinct accounting views and must not be added. Correlate
process identity with USB lifecycle logs before attributing a sample to the model page.
A real-device smoke check produced positive footprint samples and closed the tunnel afterward.

## Owned USB Safari controller

Run `dev-tools/operator-safari-controller.py` in the optional device-tools environment with
`--usbmux-socket`, `--pairing-cache`, and an `--ipc-directory` under ignored `work/`. It requires
an already trusted device with Remote Automation enabled. The default start path is the small
`/404.html` page; use `--start-path /` for the actual application. The controller creates its own
automation context and accepts local JSON `eval`, `navigate`, `recover`, and `close` commands
under `commands/`, with corresponding private `results/`. Navigation and execution are restricted
to the exact development hostname. An exclusive lock prevents duplicate local controllers;
unfinished commands are retired on startup rather than replayed into a new session.

Runtime is bounded by `--duration-seconds` (maximum 7200). Shutdown attempts cancellation and
removal of the owned light-model copy, then closes the owned tab, sends explicit session deletion
and checks that its identifier disappears. This happens before the inspector transport closes.
Inspect `ready.json` for the resulting cleanup receipt, including errors; do not infer successful
model removal or disk reclamation from a close command acknowledgement. The empty-page physical
check confirms window closure and session removal; loaded-model teardown remains unqualified.
The operator script is never copied into deployed browser artifacts.

## Voice-call trace and the closed-loop phone test

On `dev.privatelocal.chat` the voice call (`chat/call/call.mjs`) and the gapless audio player (`chat/voice/voice-player.mjs`)
report to the diagnostics stream as `call` events (`callKind`: `state`, `note`, `send`, `recogniser-open/text/end/error`,
`speak-begin/audio/end/error`, `player-push/ended/finish/finish-still`), each with the time since the call started and the speech
queue's own flags (`speaking`, `speechPending`). They carry lengths, timings and states, never what was said or heard. The code
sits between the development markers and the build strips it from both files for every other site
(`tests/dev-telemetry.test.mjs` checks that no unstripped marker ships). A tester opens `/?diag=<session id>` on the phone.

`dev-tools/operator-call-loop.py` closes the loop: it reads the stream and, each time the call says "listening", plays the next
recorded line through a speaker beside the phone (cloned voice lines made with the Qwen3-TTS Base service; the speaker must be played
in the logged-in user's audio session, not root's). It prints a timeline and says when a turn makes no progress for two minutes.

Do not try this through Safari remote automation: its sessions use WebKit's mock capture devices and mock speech recogniser, so the
microphone "hears" the literal text "Test" repeated whatever is playing (`WebSpeechRecognizerTaskMock`), and a real touch to answer
a permission prompt ends the automation. Set Safari > Microphone to Allow, and use normal Safari with the person at the phone.

What the first runs showed (iPhone 15 Pro, dev build `63b74c9`): with the system voice every sentence ended on time over four turns;
with a downloaded voice (`speaking` False throughout) the sentence started, never reported an end, was retried at the sentence limit
(about 10 s + 0.65 s per character), stalled again and was skipped. The audio-player trace is there to find which step never fires.
