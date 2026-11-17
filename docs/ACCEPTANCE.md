# Release acceptance

The migration remains **in progress** because iPhone release qualification is incomplete.
A full-GPU development control survived retained long replies but failed a later page/model cycle. Offline recovery and
qualification of the clean production artifact remain open. Hosting and desktop inference
are verified; they do not close the device gate.

The [living iPhone investigation plan](IPHONE-INVESTIGATION.md) tracks the current evidence,
prioritized experiments, and decisions. Its laboratory compiler controls do not close this device gate.

| Requirement | Current evidence | Result |
| --- | --- | --- |
| 1. Cloudflare production, canonical redirects, GitHub Pages disabled | `evidence/hosting-and-releases.json`; canonical 2B browser test blocked homelab requests and completed offline generation/reopen | Passed |
| 2. Separate dev deployment and visible identity | Separate Pages projects and branch/domain assignments in hosting evidence; both HTML shells display environment, version, commit | Passed |
| 3. Actions for main/dev and manual redeploy | Successful push/manual runs from both branches in hosting evidence; `deploy.yml` validates before upload, serializes each branch and skips stale SHAs; `OPERATIONS.md` documents rollback | Passed |
| 4. Complete project model CDN | `ops/cloudflare/model-object-verification.json` read-back hashes and sizes, public HTTP checks, pinned catalogue, runtime/license documentation | Passed |
| 5. On-device runtime, controls, offline reopen, real devices | Production 2B and dev 9B desktop receipts; interruption/resumption and cancellation receipts; real iPhone generated online and offline but also abruptly restarted | Open: iPhone reliability |
| 6. Public app and preserved data | Storage migration receipt; merged/deployed source/feedback links, public-submission notice and GitHub issue forms; no cutover banner | Passed |
| 7. Evidence and operating instructions; no acceptance failures | Evidence and operations documented, but iPhone acceptance still fails | Open until device failure is resolved |

## Desktop evidence

`evidence/production-2b-browser.json` records a fresh production installation, interrupted download
and resumption, actual online generation, offline generation, and offline page reopening followed
by loading and generation. Requests to homelab addresses were blocked; no unexpected network
requests were observed. `evidence/dev-9b-browser.json` records actual 9B f32 generation with the
same offline/reopen checks. `evidence/dev-cancellation.json` records Stop during streamed output
and a subsequent completed generation without reloading the model. These are real runtimes and
model files, not mocked inference. Browser/GPU settings and the Linux shader-f16 limitation are
recorded in `evidence/desktop-environment.json`.

`evidence/storage-migration.json` seeds the previous app's storage on the same origin, then serves
the replacement build and checks conversations/API settings survive. This is a synthetic returning
user fixture, not access to a person's private conversations. `evidence/hosting-and-releases.json`
records current project assignments, successful Actions runs, canonical redirects preserving an
encoded path/query, and GitHub Pages returning 404 after disablement.

## iPhone evidence and remaining check

`evidence/iphone-check.json` records user observations and a content-free summary of received
diagnostics. On an iPhone 15 Pro using DuckDuckGo 26.6, the 2B model downloaded, loaded and replied.
The user also confirmed generation in airplane mode after loading the already-downloaded model.
The original offline navigation redirect defect was fixed and independently retested on desktop.

The same phone also restarted during construction and later after approximately twelve seconds
of generation. A new page session appeared without a handled JavaScript error or completion.
Downloaded model files remained complete after the restart. This does not establish whether the
OS killed a process, the GPU failed, or another browser/runtime condition caused the restart.
The development-only durable diagnostic stream is now collecting the lead-up automatically.
The migration cannot be declared complete until loading and a short multi-turn conversation,
including offline reopening, pass on this device without the unresolved restart.

`evidence/conversation-recovery.json` verifies that an active conversation survives reload,
that selecting a new conversation updates the saved selection, and that a real model can reply
with a legacy internal error notice preserved in the visible transcript. Internal notices are
excluded from model/API context; original saved messages are retained.

The dev light-model profile now separates logical batch 128 from microbatch 32 while
keeping the full 4096-token context. The real-GPU comparison in
[evidence/iphone-resource-profile.json](evidence/iphone-resource-profile.json) exercises
the non-flash-attention graph selected by the phone: compute reservation falls from
94.01 MiB to 5.88 MiB and three retained turns pass. This is a resource reduction;
iPhone startup and second-turn restart acceptance remains open until device verification.

Downloads have two recovery layers. Each installer attempt retries transient failures
per file after 1, 2 and 4 seconds and retains verified files. A saved download request
then retries any reported incomplete attempt, including quota or unrecognized errors,
with a delay capped at 60 seconds until inventory is complete or the user cancels.
The request survives page restarts; it resumes when the page reopens. Completed cached
inventory can load while offline. A closed browser cannot continue downloading.

Completion automatically loads the model once. The request is cleared before native
loading so a load crash cannot trigger repeated reconstruction on reopen. Native load
failures and generation do not automatically retry. Cancel remains available during
recovery waits. Unit checks cover unknown failures, storage exhaustion, cross-page
cancellation, reload recovery and lost completion acknowledgements. See
[the download recovery receipt](evidence/download-recovery.json).

The clean production queue candidate passed local real-browser generation, offline
generation and whole-browser offline reopening, using the production artifact and
pinned native bytes. See [the candidate receipt](evidence/production-queue-candidate.json).
The service-worker status probe now retains the active channel and ignores stale
controller replies; registration starts before model initialization. iPhone validation
and production promotion remain pending.

## Latest investigation status

The compiler-control phone trial completed a 211-native-token reply without an observed restart,
but this was not a matched-prompt comparison or a complete device gate. Development now has
full request/chunk/result capture and bounded two-way controls, including remote download and
cancellation. A live normal Mac Safari session completed 512 native tokens with exact stream
reconstruction. Later USB phone trials encountered real APFS ENOSPC; temporary test models
were removed and the user cleared storage. A subsequent complete download reached native
construction but hit the kernel's explicit 2 GB per-process limit. A separate full-GPU control
completed 12 replies including three 512-token responses, a streamed cancellation and recovery,
and a bounded randomized-memory probe. See [the physical receipt](evidence/iphone-full-gpu-retained.json).
Offline recovery and the clean production artifact still require device qualification.

A clean production compiler candidate passed independently attested 7/28/512-token output parity
with its clean baseline. It is prepared only: the native selection used by production builds
has not changed, and live main remains at its previous deployment. Qualified runtime mitigation
and the exclusion of development machinery must both survive a future source promotion.
Neither this candidate nor the desktop control checks closes the physical device requirement.

A fresh page on `436f001` verified the entire cached model and completed loading and a short
reply, but the same Safari process hit its fatal 2 GB limit during a subsequent prompt.
See [the lifecycle failure](evidence/iphone-current-build-reload-limit.json). The retained pass
is preserved as evidence, not treated as release qualification. Bounded native cleanup is
the next control; production remains unchanged.

## Offline operation (2026-11-03)

Plan: `docs/OFFLINE-PLAN.md`; evidence: `docs/evidence/offline/`.

| Check | Where | Result |
|---|---|---|
| Saved app opens cold with no connection, conversations kept and found, public pages, real model reply offline, back online | Chromium, real 2B model (`matrix-chromium.json`) | Passed |
| Saved app opens cold with the origin gone, local data kept, Help from its own saved page | Mac Safari, macOS 26.7.1 (`matrix-mac-safari.json`) | Passed |
| Saved app opens cold with the network denied in the service worker (not airplane mode), local data kept | iPhone 11 Pro, iOS 18.6.2 (`matrix-iphone11pro.json`) | Passed |
| The connection pill, the checklist and the dead-connection check, on the real phone and on the Mac | iPhone 11 Pro (`ui-iphone11pro.json`, screenshots) and Mac Safari (`ui-mac-safari.json`) | Passed |
| Download interrupted by losing the connection: waits, says so, resumes, cleans up | Chromium, real 2B download (`tests/e2e/offline-download.e2e.mjs`) | Passed |
| The checklist explains a model that cannot fit (about 1.0 GB allowed, 1.2 GB needed) and lists the matching model | iPhone 11 Pro (`ui-iphone11pro-room.json`) | Passed |
| Cold start with the network denied, the pill, the checklist, and a real reply from the downloaded 2B model after a cold start | iPhone 15 Pro, iOS 26.6.2 (`ui-iphone15pro.json`) | Passed |
| Real airplane mode on a phone | By hand | Open |
| Real airplane mode, Safari force-quit and reopened, a message sent | iPhone 15 Pro, by hand (owner): the Offline pill showed, the model thought for a while, then replied | Passed |
| Real airplane mode on the iPhone 11 Pro in a normal Safari tab, Safari force-quit, the 350M Granite answers | Owner, by hand, 2026-11-04 (after finding the first tab was private) | Passed |
| A private window is recognised and named (WebKit under Playwright stands in for it) | `tests/e2e/private-window.e2e.mjs` | Passed |
