# iPhone reliability investigation

Updated: 2026-10-30 UTC. Owner: the agent continuing this investigation, with John providing physical iPhone observations when a qualified experiment needs them.

**Status: open.** Both the CPU construction control and a later full-GPU page/model cycle hit the kernel’s 2 GB per-process limit. A retained full-GPU session passed long replies and cancellation, but repeated lifecycle qualification failed. Native cleanup and process-resident allocations are the next investigative control; offline recovery and clean production qualification remain open.

This is the living plan and decision record. Keep the current state and next action accurate, append results to the experiment log, and preserve failed controls. [Release acceptance](ACCEPTANCE.md) remains the authority for completing the migration.

## Current state and next action

- The iPhone 15 Pro can download, load, and generate, including offline, but construction and longer generation have also caused abrupt page replacement.
- The latest user-observed generation restart occurred on development commit `c41c9f524f9bc754639aeffa3c01df80824294e3`, during a slow Gettysburg response. The last progress event recorded 100 stream chunks, not an attested count of 100 native tokens. A replacement page started at `2026-10-30T01:59:07.174Z`.
- The earlier zero-layer-offload control still placed the tied embedding/output head on GPU. The deployed development default has returned to full GPU offload. Moving weights between CPU and GPU does not establish a reduction in total process footprint.
- Read `/version.json` for the deployed identity. The verified E03 storage-fix checkpoint was `e7302bf1c5a3746e100076ff9828e8869a618233`; the subsequent remote download controls are now recorded below. Its 51-function compiler candidate remains variant `privatelocalchat-compiler-control-20261030-v1`, Wasm SHA-256 `dbaf064fbeefcae1ab86322a9e52b2fc0de2e52e1f9e00cf72a787ed1f1142fc`. E03 added full-object capture, two-way commands and failure-safe diagnostic/model-storage handling. The initial physical candidate session completed 211 native tokens; the full device gate remains open.
- Initial E01 qualification has passed byte reconstruction, real-GPU output parity, ten retained GPU turns including 512 native tokens, cancellation/recovery, fresh-context reset without weight reload, offline generation, a 30-second hold, and all 35 repository checks. The reduced-placement profile passed a real 512-token response and a separate focused recovery/reset/offline session with a 30-second hold; its additional ten-turn stress run was intentionally stopped and is not a pass. A renewed external WebKit comparison with 30-second holds measured 1531.6 MiB after-generation peak for the baseline and 818.8 MiB for the candidate. See [the E01 receipt](evidence/dev-compiler-control.json).
- The deployment workflow succeeded. All three published runtime files match their pins, and the published app completed the 7/28/512-token sequence with baseline-identical text. The receiver received the browser's variant and full hash. Production remains at `4d74acdc856b02212cd2a3afa18aa245bcaae189`.
- E02 produced a completed **211-native-token** reply on the same phone page session without a user-observed restart. Native timings were 123.1 seconds of prompt processing and 172.1 seconds of decoding; 173 prompt tokens were evaluated, with zero reuse. The initial Gettysburg response was only 12 native tokens. Content-free diagnostics cannot establish the exact prompts, answer text or word counts. See [the first physical trial](evidence/iphone-compiler-first-trial.json). This supports continuing the candidate, not a completed release gate or causal proof.
- E03 has live Chromium and normal Mac Safari command/full-stream verification, including a 512-token Safari reply. Physical USB configuration, downloads and load-failure receipts were exercised without user relay. Generic browser storage errors were resolved to kernel ENOSPC; the iPhone's immediate space metric was about 0.5 GB after our temporary test models were removed. See [the storage receipt](evidence/iphone-usb-storage-failure.json). Do not infer usable space from the misleading `TotalDataAvailable` field.
- The user cleared device storage. A fresh unattended CPU-profile load then hit the explicitly logged 2 GB per-process limit; the [kill receipt](evidence/iphone-single-copy-load-limit.json) supersedes the earlier unknown-cause statement for this specific trial.
- Full GPU placement completed 12 replies, including three 512-token replies, plus a streamed cancellation and subsequent recovery on one physical page/model load. A random 64 MiB canary was verified after 151 seconds. This supports restoring the GPU default; it does not close offline or production qualification.
- The fresh `436f001` page passed checksum verification, loading and a short reply, then the same Safari process hit its 2 GB limit during the next prompt. Retained-turn success does not establish lifecycle reliability.
- **Next action:** qualify the explicit native owning-context teardown candidate described below in sustained full-GPU controls, then rebuild the corresponding development candidate before physical lifecycle testing. The native-exit acknowledgement alone did not prove model destruction. Physical testing still requires reclamation of our retained automation storage; shared Safari restart approval is pending. Keep production and the diagnostic compiler-control selection unchanged until the device gate passes.

## Evidence and its limits

The durable, content-free research snapshot is [evidence/iphone-compiler-research.json](evidence/iphone-compiler-research.json). Raw measurements and harnesses remain in the ignored `work/` directory; those working files are not included in a repository clone.

The archive explicitly identifies compiler, JavaScriptCore, and driver memory outside native accounting. Some later conclusions nevertheless equate finished inference with nothing running. Browser compilation and other asynchronous work can continue after a native request finishes. Flat Wasm, allocator, checkpoint, pipeline, or queue counters therefore cannot establish flat browser footprint.

Our native runtime was exercised in Linux WPE WebKit 26.4 with verified real model bytes and a non-computing GPU substitute. This executes native GPU graph and shader-building paths but allocates no real model-weight GPU buffers and produces no meaningful model answers. External process RSS sampling found:

| Control | Peak RSS after generation in MiB | Interpretation |
| --- | ---: | --- |
| Original binary, first and reverse-order runs | 1531.3 / 1541.5 | Delayed surge reproduced |
| Same binary, OMG optimizing tier disabled | 729.4 / 731.9 | Large reduction with compiler setting changed |
| 15 bodies larger than 40 KB excluded from OMG | 1089.7 | Partial reduction |
| Three shader-building functions excluded | 1562.4 | Does not sufficiently explain the surge |
| Attention-mask wrapper alone excluded | 1450.0 | Does not sufficiently explain the surge |
| Same binary, OMG candidate size limited to 20 KB | 807.7 | Size-range control reduces the surge |
| 51 bodies larger than 20 KB excluded from OMG | 818.1 | Binary control reproduces the reduction |

All these controls ended with the same 274,464,768-byte Wasm capacity, approximately 262 MiB, and one bounded checkpoint. The compiler controls generated 256 native tokens against the GPU substitute. These are **phase-specific peaks after generation**, not the overall construction peaks.

A separate original-binary run waited 25 seconds after Ready before inference. It still reached 1467.6 MiB about 3.8 seconds after inference completed. Back-to-back loading and generation do not alone explain the second surge.

The 51-body binary also passed three retained turns on real Chromium/Vulkan hardware with baseline-identical text and native completion counts of 7, 28, and 512. This establishes execution correctness for those cases, not general model parity or iPhone survival. Fully CPU local controls did not show a reduction in their dominant construction peak; they exercise different placement and code paths.

Linux RSS is not iOS physical footprint, Linux WebKit 26.4 is not the phone's WebKit, and host compiler concurrency can differ. Do not add these RSS figures to phone GPU allocation figures to predict an iPhone peak. The earlier supplied Jetsam report establishes approximately 2 GiB per-process-limit terminations in DuckDuckGo WebContent; it predates the latest restart by almost seven hours. See [the historical report summary](evidence/iphone-jetsam-150503.json).

## Leading experiment

### E01 Qualify the compiler control independently

Prepare a development-only runtime candidate with an explicit variant identity and SHA-256. The existing laboratory binary retains the baseline native build ID, so that ID alone cannot distinguish it. Record exact bytes and hash rather than treating a matching build string as sufficient provenance.

Keep model bytes, GPU placement, context, batches, checkpoint policy, queue policy, prompts, output limits, storage path, and diagnostic policy fixed against the selected baseline. Do not combine this experiment with restoring full GPU placement, changing models, trimming prompts, or adding new per-token instrumentation.

Before the phone trial:

1. Attest the artifact actually fetched and executed, including the complete worker/glue/Wasm combination and effective configuration.
2. Repeat real-GPU deterministic output comparisons and longer retained conversations, including a 512-token response, cancellation and subsequent recovery, and a context reset without reloading weights. The existing three-turn comparison is a starting receipt, not completion of this gate.
3. Repeat phase-specific external process sampling in supported local WebKit controls. Include loading, Ready hold, prefill, generation, and at least 30 seconds after generation. Track the allocation introduced by the control itself and performance changes.
4. Preserve production exclusions. Experimental runtime selection and diagnostics must remain development-only and unavailable on the production hostname after any future source promotion.
5. Write the candidate identity, checks, outcome, and precise phone procedure into this log. Preserve the previous artifact for rollback.

Padding bodies beyond the optimizing compiler size threshold is a diagnostic intervention. It is not an accepted permanent mitigation. A maintainable build or source change requires its own measured memory, correctness, and latency qualification; a smaller Wasm file alone is not evidence of lower compiler memory.

### E02 Run one retained iPhone session

After E01 passes, use the existing diagnostic receiver and durable local saving. Collect available device/browser information automatically. Ask John only for actions or observations that the stream cannot supply.

Use the existing failed baseline as the initial reference; do not demand another unchanged crash simply to repeat it. For the candidate, load once, hold Ready for 30 seconds, send three short prompts, then one long response of up to 512 actual native completion tokens, and observe for at least 30 seconds afterward. Keep the model loaded between steps. If the session survives, continue into longer multi-turn, cancellation, rolling-context, and offline checks as separate recorded stages.

Stop at the first unexpected replacement or white screen. Reconnect/reopen only as needed to recover saved events. Do not repeatedly reconstruct or automatically retry native generation after a loss. Robust download retries remain a separate behavior.

Record actual prompt tokens evaluated/reused, completion tokens, graph work, timings, checkpoint and queue bounds, stream/observer counts, recovered native fences, and page identity transitions. OS termination evidence is valuable when available, but another Jetsam report is not a prerequisite for learning from the run. Label the termination cause unknown when it is unknown.

### E03 Interpret and choose the next branch

| Outcome | Next decision |
| --- | --- |
| Candidate survives the previously failing workload | Treat this as evidence that compiler treatment is protective; repeat paced sessions and qualify margin before attributing the entire failure or accepting a fix |
| Candidate still fails | Check artifact/configuration identity and surviving evidence, then pursue browser footprint and resource lifetime; the local compiler finding remains valid |
| Output differs or the candidate introduces errors | Reject it as a phone candidate and repair the control first |
| Improvement depends on other simultaneous changes | Mark the comparison confounded and isolate those changes locally before another phone campaign |
| Native ledgers remain flat | Continue external/indirect footprint investigation; do not classify the process as memory-stable |

## Other investigative paths

Pursue these as evidence directs, with one primary question per experiment.

| Priority | Path | Discriminating investigation |
| --- | --- | --- |
| 1 | Actual browser footprint | Attribute time-resolved process peaks on real WebKit/GPU hardware when accessible. Controlled touched-ballast measurements can estimate available margin when category attribution is unavailable, but measure their own overhead and avoid repeated destructive trials |
| 2 | GPU driver and resource lifetime | Distinguish submitted work, completed work, object release, and physical reclamation. Examine mappings, readback/staging buffers, driver caches, and live resources; creation counts alone cannot establish residency |
| 3 | Wasm and model-source overlap | Compare capacity with touched physical pages and allocator liveness; audit source handles, read windows, upload copies, and release boundaries during construction and first use |
| 4 | JavaScript and observer pressure | Run a same-runtime comparison of current versus bounded/coalesced observation with identical native work. Count messages, serialization, retained objects, durable writes, and outbox bounds. Historical Mac observer results do not qualify the phone |
| 5 | Hybrid recurrent state | Use a dense attention-only model as one mechanism control after the shared paths are better constrained. Differences in model size, kernels and workload are confounds; a different model surviving would implicate, not uniquely prove, a hybrid defect |
| 6 | Lifecycle and deliberate teardown | Audit worker termination, visibility transitions, context/device loss, admission failures and teardown reasons. Preserve this classification alongside every branch; earlier research found successful Ready followed by an intentional application termination misclassified as an OS loss |

## Qualification and stop rules

The investigation closes only when a maintainable candidate completes repeated paced sessions on the actual device, including loading, sustained multi-turn and long generation, cancellation/recovery, rolling reset, offline generation and offline reopen. Keep model weights retained through each applicable sequence. Document observed margin and measurement limits; do not choose a headroom threshold merely because one short reply passed.

Require bounded checkpoint, queue, observer and allocator behavior, plus evidence about browser-process peaks. The migration and production promotion remain open until the [release acceptance](ACCEPTANCE.md) device gate is satisfied. A finite test campaign establishes the tested operating envelope, not universal crash freedom.

Stop unchanged crash repetitions, short-answer-only qualification, and attempts to turn an unknown process loss into a handled-error diagnosis. Do not silently replace the model, cap answers to conceal the failing workload, or repeatedly shrink context/batches without a discriminating measurement. Preserve user conversation data and the disclosed diagnostic privacy boundary.

## Experiment log

Dates below are UTC. Historical entries are a research baseline; linked receipts define their narrower scope.

| Date | Experiment or decision | Outcome and consequence |
| --- | --- | --- |
| 2026-10-30 | Bounded native GPU queue and checkpoint policy reviewed | Bounds were attested, but the phone still restarted; those bounds do not establish total process margin |
| 2026-10-30 | Existing reduced GPU placement on iPhone | Automatic download/load reached Ready; longer generation restarted. Placement alone is insufficient; see [placement receipt](evidence/dev-model-placement.json) |
| 2026-10-30 | Historical Jetsam report correlated | Earlier WebContent per-process-limit losses confirmed; latest restart cause remains unproved |
| 2026-10-30 | Historical research audited | Prompt/dose narratives revised, observer controls scoped to Mac, stale source accounting and deliberate teardown distinguished from OS loss |
| 2026-10-30 | Independent upstream compiler example reproduced in both orders | Delayed browser allocation reproduced without model weights or GPU; establishes the mechanism class locally |
| 2026-10-30 | Fully CPU app controls | Dominant construction peak not removed by padding or valid OMG-off setting. An earlier run using invalid `JSC_useWasmOMGJIT` was rejected; the valid option is `JSC_useOMGJIT` |
| 2026-10-30 | Native GPU-path compiler controls | Normal versus OMG-off delayed peaks reproduced in reverse order; native capacity identical |
| 2026-10-30 | Narrow function controls | Three shader builders and the attention-mask wrapper individually insufficient; retain these negative results |
| 2026-10-30 | 20 KB candidate-size setting and 51-body binary control | Both substantially reduced the local delayed peak. Three real-GPU turns matched baseline text and token counts |
| 2026-10-30 | Loading separated from inference by a 25-second hold | A second delayed surge persisted after inference; timing overlap alone is insufficient |
| 2026-10-30 | Plan adopted | Prioritize compiler-control qualification, then a single retained iPhone session. E01 remains pending beyond the existing laboratory checks; no research candidate deployed |
| 2026-10-30 | E01 candidate prepared | Reproducible 51-body transform reconstructs the exact baseline; worker, wrapper and inference settings preserved. Dev build metadata and startup diagnostics distinguish the variant from its unchanged native build string |
| 2026-10-30 | E01 parity and full-GPU endurance | Baseline-identical text and 7/28/512-token turns; ten retained candidate turns plus cancellation/recovery, fresh-context reset, offline reply and hold passed. All 35 repository checks passed, including production exclusion |
| 2026-10-30 | E01 insufficient workload corrected | Initial integer-list fixture abbreviated its response to 13 tokens. Rejected as a long-generation stimulus, then reran using the verified 512-token sequence; this was a fixture limitation, not an application crash |
| 2026-10-30 | E01 phase measurement repeated | With 30-second Ready and post-generation holds, after-generation peaks were 1531.6 MiB baseline and 818.8 MiB candidate in the local non-computing GPU control. Actual iPhone margin remains unmeasured |
| 2026-10-30 | E01 reduced-placement long response | The desktop phone-placement profile completed 7-token and 512-token replies with unchanged 945,422,336-byte Wasm capacity and zero pending graph batches. The additional long-continuation run was intentionally stopped by the operator because of expensive CPU prefill; it is not a completed ten-turn result or a crash. Reduced-placement cancellation/reset/offline checks use a separate focused session |
| 2026-10-30 | E01 focused reduced-placement checks | Three short turns, cancellation and subsequent reply, fresh-context reset without reloading weights, offline generation, and a 30-second hold passed in a separate activation. Initial candidate qualification is recorded in [the E01 receipt](evidence/dev-compiler-control.json); physical iPhone comparison remains open |
| 2026-10-30 | E01 development deployment verified | [Workflow 41012496116](https://github.com/johnbenac/privatelocalchat/actions/runs/41012496116) deployed `eb8a16d`. Runtime read-back hashes matched all three pins; published real-GPU 7/28/512-token replies matched the independent baseline. Receiver provenance verified; production unchanged. E02 requested and awaiting the physical candidate session |
| 2026-10-30 | Published parity helper corrected | Candidate-only live mode initially compared its result to itself. An independent comparison of the saved published output against the earlier baseline confirmed all three replies and token counts match; the operator helper now requires that separate baseline receipt |
| 2026-10-30 | E02 initial phone trial | The user multitasked during downloading, resumed, and reached automatic Ready in 5.35 seconds. Three short replies and an initial 12-token Gettysburg reply completed. A subsequent longer reply completed 211 native tokens with no observed replacement; same page identity, one checkpoint, fixed Wasm capacity and zero pending graph batches. Exact prompt/answer content and 50-word compliance were not captured |
| 2026-10-30 | E03 live Safari finding | Live Cloudflare browser command/reassembly proof passed. USB Safari preserved model files and settings, but the diagnostic IndexedDB open stalled while a fresh test database and OPFS journal read completed. Bound storage waits, keep memory uploads working and avoid forcing an existing-journal schema upgrade. Do not classify this as an inference crash |
| 2026-10-30 | E03 local qualification | 45 tests passed; real Chromium/Vulkan completed 512 native tokens, reconstructed all 514 stream objects and matched terminal/UI text. Remote state, chat, profile, load, prompt, stop and unload passed. See [receipt](evidence/dev-two-way-control.json). Live deployment and physical remote generation remain to verify |
| 2026-10-30 | USB route enabled | Remote Automation permission enabled by John; created a separate phone Safari context, evaluated the actual dev build and configured its own receiver without using the other project’s tab. This is additional Safari evidence, not a substitute for ordinary phone-browser qualification |
| 2026-10-30 | E03 scope authorized | User explicitly requested full prompt/response objects, streamed token text, and remote control through the user-entered receiver URL. Implement development-only consent, command/result receipts, crash-safe non-replay, and agent-driven tests. Existing content-free sessions must not silently enable content capture without local choice or their owner's explicit session authorization |
| 2026-10-30 | Mac route restored | Active Mac SSH endpoint discovered; a separate Safari window opened for this app and its build read successfully through JavaScript. USB phone-target attachment is still being established; other project windows and inspector sessions must remain untouched |

## How to maintain this plan

After every meaningful experiment or decision, update the current state and next action, append a dated log entry, and add or link a content-free evidence receipt. Record failed, invalid, inconclusive and confounded results as explicitly as passes. Correct earlier interpretations with a dated correction rather than silently erasing the history.

Each new receipt should identify the question, baseline and candidate hashes, changed variable, hardware/browser, effective configuration, observer policy, workload and actual native work, phase-specific measurements, result, limitations, and resulting decision. Separate wall-clock UTC timestamps from elapsed times and observation from inference. Persist enough summary/provenance in Git that loss of ignored working files does not erase the finding.

Keep raw device reports, private telemetry, receiver URLs/capabilities, credentials, device identifiers and conversation content outside Git. Public summaries must honor the existing diagnostics disclosure. Commit plan and receipt updates together when practical. A documentation update does not itself authorize or imply deployment or promotion; keep the deployment status explicit.

## References

- [Development diagnostics](DEV-DIAGNOSTICS.md), [native runtime operations](../ops/native/README.md), and [runtime provenance](RUNTIMES.md).
- [WebKit bug 304810](https://bugs.webkit.org/show_bug.cgi?id=304810), including a reported compiler-memory failure on iOS 26.6.2 build 23G90. Similarity does not establish this app's latest failure cause.
- [Independent compiler reproduction](https://github.com/frankhinek/webkit-wasm-compiler-memory-repro), inspected at revision `16fb14700468a866bee731666060af274eb91d85`.
- Local historical sources: `/srv/speechtest-lab-data/`, `/srv/speechtest-recovered/docs/`, `/srv/speechtest-cleanroom/WAVE2-CHANGES.md`, and `/srv/vitruvian/docs/residency-execution-plan.md`. Their conclusions apply to their attested configurations, not automatically to this app.
- Detailed local synthesis and original receipt hashes: `work/evidence/iphone-memory-research.json`. Experiment harnesses and raw samples remain under `work/`.

### USB automation scope

The USB WebDriver route creates an isolated Safari automation session. Its storage starts empty
and is discarded when that session ends; it cannot certify ordinary PWA persistence across
new automation sessions. Keep a single session alive for download, load and conversation trials.
The normal Safari window on the Mac is a separate comparison, with its own diagnostic receiver.
See [WebKit’s iOS WebDriver isolation description](https://webkit.org/blog/9395/webdriver-is-coming-to-safari-in-ios-13/).

On build 997bf35, physical remote state/chat/load commands received acknowledged receipts. Two
loads with the native recorder enabled returned InvalidStateError before native construction.
Disabling that recorder allowed model parsing to progress, but subsequent telemetry and USB
responses stopped. No new relevant iOS crash report was available at inspection time. This
localizes a recorder-sensitive startup failure without proving the reason for the later loss.
The app reports the unavailable IndexedDB fallback explicitly; it cannot promise durable offline
capture while that fallback is active. A fresh uninterrupted automation-session trial is next.

### Storage-worker cleanup follow-up

The fresh USB session repeatedly retained 3 verified files (564,402,176 bytes) while later writes
reported `Failed to write to file`. The model-download request retried automatically. Stop that
unchanged repetition to investigate cleanup. The device identifies as iPhone16,1 on iOS 26.6.2
build 23G90 and reports roughly 76.5 GB data space available.

Inspection found a concrete vendored-writer lifetime defect: an open rejection occurs before
the returned close function exists; a close rejection skips `worker.terminate()`. The application
now owns model-cache writes with unconditional worker termination, input cancellation and
bounded operation waits. Cache keys, metadata, model hashes and pinned native bytes are retained.
The [cleanup receipt](evidence/opfs-writer-cleanup.json) records fault tests and actual browser
cache-manager integration. A causal role in historical phone failures remains unproven.

The normal Mac Safari window completed 7- and 512-native-token replies through the live command
channel. All 550 captured objects were complete; stream text, terminal text, requests and saved
chat matched. The long reply took about 1.05 seconds of prefill and 20.39 seconds of decoding.
See [the Safari receipt](evidence/dev-safari-two-way-control.json). This is real WebKit/Metal
evidence, not physical iPhone acceptance. Separately, 51 content frames survived an actual
desktop browser close/reopen offline, stayed queued after an invalid acknowledgement and
drained after a valid acknowledgement with exact object reconstruction.

### Physical storage finding and correction

The fresh writer still encountered failures. A bounded USB system-log capture then recorded
APFS ENOSPC (errno 28) for WebKit.Networking and other iOS services. A tiny independent OPFS
probe returned the generic UnknownError text suggesting an unknown reason, for example memory;
that JavaScript wording did not reveal the actual no-space failure. Preserve reason-agnostic
retry and cleanup rather than inferring the cause from that message.

**Correction:** the earlier 76.5 GB `TotalDataAvailable` reading was not usable immediate
headroom. After removing this isolated automation session’s 564,402,176 model bytes, the device
reported only 505,454,592 bytes in `AmountDataAvailable`. Its normal browser chats/model files
were not touched. The test download intent was cancelled and zero model bytes remained in the
isolated session. Ask for at least 3 GB of real headroom before another model download.
The [storage receipt](evidence/iphone-usb-storage-failure.json) records this finding and scope.
This explains the observed write failures, not all previous generation-time restarts.

E03 has live Chromium and normal macOS Safari command/full-stream proof. Physical iPhone
commands, receiver configuration, downloads and load-failure capture were exercised unattended,
but remote physical generation and durable offline qualification remain open. Production stays
at its previously deployed commit; do not promote this work based on desktop success.

### Unattended-control and clean-production preparation follow-up

The remote channel now exposes download and cancel-download using the ordinary recovery flow.
A real HTTPS/Chromium test learned an owner grant without reload in 3.195 seconds, preserved
428,120,416 verified bytes after cancellation, resumed all 13 files, automatically reached Ready
and completed 512 native tokens. Request, stream and final text matched; stop and unload passed.
See [the control receipt](evidence/dev-download-control.json). The short-lived browser profile
was removed. The USB preflight helper independently rechecked only 417,796,096 immediately
available phone bytes, and its temporary connection/tunnel were closed. No phone download ran.

A separate compiler control was prepared from the clean production queue baseline, SHA-256
`1bf7ed18c5cf0071d5ce2651c952778103c65d75f658b8b9638f2988912ab1b8`. Its candidate is
`ea9d24143b3c1ba6a0c73213be7dbc7fc57c0472b8e55d6cf7206807ad1fe0fd`. Reconstruction,
interfaces and all 51 skipped-body changes verify. A production UI build with development
controls absent completed baseline and candidate turns of 7, 28 and 512 native tokens with
identical text and attested native hashes. See [the preparation receipt](evidence/production-compiler-control-preparation.json).
This leaves source production selection and live main unchanged; iPhone and margin gates remain.

### Storage ownership and single-copy delivery follow-up

The user freed phone storage; the earlier storage prerequisite is satisfied. The next
preflight measured about 2.55 GB immediately available. Maintain project garbage collection
rather than repeating requests for user cleanup. Server test profiles and build artifacts
that are no longer needed must be removed or archived on bulk storage.

A dedicated desktop QA profile exposed a second copy of 12 model shards (774,368,224 bytes)
in ordinary HTTP cache alongside explicit model storage. Its HTTP cache was cleared while
retaining OPFS. CDN weight responses now carry `no-store` through a late header transform;
edge caching remains enabled. A real browser verified a 21,250,464-byte shard was unavailable
through ordinary HTTP cache offline, while an explicit CacheStorage copy remained readable.
The temporary explicit cache was deleted. See the [storage receipt](evidence/model-single-copy-storage.json).
Previously cached responses on other devices are not retroactively purged.

The fresh physical USB trial on build `4d50add` completed downloading and automatically
entered its first model load, then stopped sending events during native construction at
10:28:42 UTC. The source-window ledger last reported 169,681,696 touched bytes. The first process lookup followed a neighboring WebContent process and missed the actual
model process. Corrected correlation finds the kernel's explicit `ActiveHard 2048 MB (fatal)`
and `per-process-limit` kill at 10:28:42 UTC, at 2,097,155 KB. The preceding warning reports
1,638 MB physical footprint, 939 MB bmalloc and 695 MB Gigacage, while JavaScript GC heap
capacity is only 3 MB. These are different accounting views, not additive allocations.
No new relevant crash report was found after flushing pending reports; the live kernel record
supplies the missing kill reason. Automated prompt dispatch never ran.

The next controlled physical trial keeps the compiler-control Wasm and model fixed and changes
only the requested layer profile from CPU (`0`) to full GPU (`-1`). This directly tests the
construction footprint and restores the intended fast device path if it passes. Record native
allocation counters and full system logs, then require multiple replies and a long response.
Do not equate low JavaScript heap or a flat native ledger with low total process footprint.
See the [physical kill receipt](evidence/iphone-single-copy-load-limit.json).

### Full-GPU retained physical control

The compiler-control Wasm stayed fixed while layer placement changed from `0` to `-1`.
The source change between the two deployed identities contained only CDN operations and docs.
The phone reached Ready once, retained the same page and model, completed 12 replies including
three 512-native-token replies, stopped an additional reply after 57 native tokens, and completed
a subsequent 427-token reply. All 2,243 captured objects were complete and each completed
response's native stream matched its terminal text. The model was unloaded afterward.
See the [physical retained-control receipt](evidence/iphone-full-gpu-retained.json).

Full GPU placement used 134,217,728 Wasm bytes, compared with roughly 945 MB in the CPU control.
Checkpoint high water remained 20,201,932 bytes; GPU queue high water was two batches with zero
pending at the final sample. This does not measure total process memory. WebKit still sent
memory-pressure warnings; no per-process-limit kill was observed in this retained trial.

A separate 64 MiB allocation filled with random bytes remained readable for about 151 seconds
through a long reply and the cancellation sequence. Its contents were verified before release.
This is a limited stress observation, not an absolute safety margin or a chosen release threshold.
The development default now returns to full GPU placement; the failing CPU placement stays an
explicit diagnostic control rather than an automatic phone override.

Checksum verification is prepared separately with unmodified pinned MIT-licensed noble-hashes
2.4.0. Each checksum reads at most 1 MiB at a time in a short-lived worker, terminated on every
exit path. The real 428,120,416-byte shard matched its pinned hash in Chromium with an OPFS File
and in Linux WebKit with an HTTP Blob (that build lacks OPFS). Known-vector, differential,
bounded-read and failure/cancellation checks passed. See the [checksum receipt](evidence/bounded-model-checksum.json).
This removes an avoidable whole-shard allocation; it is not yet physical checksum qualification
and does not prove that checksums caused the previous kill.

Next: deploy and read back the new full-GPU default/checksum build, reuse this isolated phone
cache for fresh-page qualification, then test offline recovery and a clean production compiler
preview. Keep production unchanged until those device checks and diagnostic exclusion pass.

### Fresh-page repeat failed: lifecycle gate remains open

Build `436f001` reused the isolated cache, retained diagnostic settings and selected GPU layers
`-1` by default. Its new checksum worker verified all 13 files (1,202,488,640 bytes) in 8.545
seconds with no mismatch and no model redownload. A new load and first short reply completed.
During the second prompt, the kernel killed WebContent at 11:00:34 UTC for the same fatal
2 GB per-process limit. This was the same Safari process as the earlier retained 12-reply
trial, after explicit unload/host restart and navigation. Thus the earlier retained pass
does not qualify repeated page/model lifecycles. See the [repeat-failure receipt](evidence/iphone-current-build-reload-limit.json).

The controller was stopped; recovery in that automation session timed out, and its owned
session was closed. No additional native load was dispatched. The USB capture preserved
the explicit kill reason without relying on a separate Jetsam file.

Inspection found the pinned wrapper normally terminates an owned native worker without
calling its existing `wllama.exit` wire operation. The next candidate requests native cleanup
with a bounded wait, then terminates regardless of success or failure. This is a concrete
cleanup improvement and a hypothesis about lifecycle accumulation, not established cause.
Repeated load/unload and page navigation must pass before returning to production or offline
qualification. Keep model and compiler-control bytes fixed for this comparison.

### Bounded native cleanup and direct footprint instrumentation prepared

The adapter now requests the pinned runtime's existing `wllama.exit` operation before worker
termination. The request has a 3-second bound; failure or timeout still proceeds to termination.
Externally owned workers keep their existing ownership behavior. Three real Chromium/Vulkan
load/generate/unload cycles each completed 512 native tokens and acknowledged cleanup in
12–15 ms, with no page errors. Native Wasm and vendored wrapper bytes stayed fixed.
See the [candidate receipt](evidence/native-cleanup-candidate.json). The unit suite now has
59 JavaScript checks and five stdlib-only Python operator checks. Physical comparison remains open.

The USB Instruments route now works through a userspace RSD tunnel. The operator sampler
obtained real positive process `physFootprint` readings, then closed the connection and tunnel.
This supplies the previously missing time-resolved physical metric for the next phone trial;
raw PID/unique-ID samples stay private under `work/`. Correlate with the exact page/process
before making model-specific claims.

A separate dev-only service-worker network-denial harness passed real HTTPS browser checks,
including denied CDN misses and diagnostic POSTs, cached navigation after worker restart,
and restoration. Production build inspection confirms its removal. It changes neither radios
nor `navigator.onLine`, so it cannot stand in for every airplane-mode behavior.

### Automation storage cleanup prerequisite

The next native-cleanup trial's preflight found only 964,079,616 immediately available bytes.
Read-only Instruments listing confirmed that the closed prior automation namespace still
contains all 13 model-file entries. Its last verified model size was 1,202,488,640 bytes;
current sizes were unavailable through that API. A new session contains zero model bytes
and its shell brought immediate headroom to 884,539,392 bytes. No new model download started.
See the [retention receipt](evidence/iphone-automation-storage-retention.json).

The newer CoreDevice filesystem service is unavailable on this device and House Arrest does
not vend the Safari container. Normal browser data was not deleted. Request permission before
restarting shared iPhone Safari because the user has another agent observing a different
project there; a restart is a proposed reclamation attempt, not proven cleanup. Clear the
new empty session's own caches before closing it and prevent another model copy until the
retained test data is reclaimed. Do not ask the user to clear unrelated personal data.

### Independent release qualification while phone restart is pending

The development cleanup candidate passed three real Chromium/Vulkan page-reopen cycles with
512 native tokens per cycle and cached-model reuse. Normal Mac Safari 27.0 / Metal passed
three 512-token cycles across page navigation, with exact text reconstruction, 1,598 complete
captured objects and cleanup acknowledgements of 31–37 ms. Its test model was removed. See
[the Chrome receipt](evidence/native-cleanup-page-reopen.json) and
[the Safari receipt](evidence/mac-safari-native-cleanup.json). Neither attests iPhone behavior.

The separate draft release branch selects the clean `ea9d2414…` compiler artifact, verifies
its reconstructed baseline during builds, and leaves the native wrapper/worker clean. Its
production-mode artifact passed desktop online generation, long replies after page reload,
offline generation and whole-browser offline reopening/loading/generation. See
[the artifact receipt](evidence/selected-production-lifecycle-offline.json). The preview at
`https://cb3639ba.privatelocalchat.pages.dev` has independently verified native hashes and no
diagnostic endpoints/modules or network-fault harness; canonical production remains at
`4d74acd`. See [the preview receipt](evidence/clean-production-preview.json).

Do not conflate the release branch's provisional selection with this development branch's
production selection. If qualified, carry the exact clean pin and production build-verification
change back into the promotion source before merging to main. Keep PR 51 draft.

An initial fresh deployed install faulted at automatic loading without preserved error detail.
The corrected second attempt verified all 13 CDN files and completed 7- and 512-token replies
then verified model removal and deleted its temporary profile. Its observer assertion failed
on 13 aborted weight requests; their role was not established. Preserve both the
[initial failure](evidence/preview-initial-cold-load-failure.json) and
[later observations](evidence/deployed-clean-preview-inference.json). The initial failure
remains unexplained; the preview and physical-device release gates remain open.

### Download observer controls and bounded physical storage probe

Small-shard Chromium controls reproduced `net::ERR_ABORTED` after valid downloads even with
service workers blocked and without Playwright routing. Plain fetch-to-buffer and raw
fetch-to-OPFS controls finished normally; wrapping the response stream reproduced the observer
event. A proposed alternate downloader passed unit checks but still reproduced the event
in all three complete SDK trials. It was rejected and the tested source restored. See the
[negative-control receipt](evidence/download-stream-negative-control.json). This does not
establish data corruption or an iPhone memory cause, and the initial cold-load fault remains open.

The physical iPhone then installed one 21,250,464-byte pinned shard using published build
`9f4805b`, deep-verified it without mismatch, removed it, and inspected zero model bytes.
The small static entry page started neither the app nor a service worker; its own CacheStorage
and registrations were cleared before closing only the owned tab. USB kernel messages identify
the WebContent PID touching that shard, allowing direct footprint correlation. See the
[phone storage receipt](evidence/iphone-small-shard-storage.json). No native model was loaded.

Post-test immediately available disk space is 956,436,480 bytes, below the full model size.
Do not create another full model copy. The prior retained automation files still need
reclamation, and the shared Safari restart question remains unanswered. Production and the
draft promotion gate remain unchanged.

A second filesystem API independently reported 1,167,400,960 free bytes; Lockdown reported
957,689,856 available plus 209,715,200 reserved bytes. Both are below the complete model size.
The 78 GB `TotalDataAvailable` field is therefore not a sound basis for starting another
full copy. The correlated small-shard WebContent footprint stayed below 41 MB in this bounded
trial; that does not predict the footprint of native inference.

A read-only USB enumeration found zero currently inspectable tabs at the exact development
host. Reusing a normal development tab's existing cache is therefore unavailable at this
check; other projects' pages were neither attached to nor changed.

### Fix operator teardown before further storage-heavy trials

Inspection found that the private bridge's outer `finally` attempted tab cleanup after its
WebInspector context manager had closed the connection. The new versioned operator controller
performs cleanup inside that connection, explicitly deletes its own automation session, and
checks session disappearance. An actual empty-page phone trial confirmed both owned-window
closure and session removal. Five Python operator checks pass. See the
[controller receipt](evidence/usb-controller-session-cleanup.json).

WebKit has distinct `closeBrowsingContext`, `deleteSession`, and disconnect paths; see the
[upstream implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/Automation/WebAutomationSession.cpp).
The old namespace was still accessible after an earlier corrected close. This is a controller
cleanup fix, not proof of reclaimed old storage or a fix for native memory kills. The
controller's loaded-model cleanup path and full phone lifecycle remain to be qualified.

### Native exit acknowledged checkpoint cleanup, not destruction of the model owner

The pinned clean source and its compiled `1bf7ed18…` artifact show that `wllama_exit` calls
`app.shutdown()` and `llama_backend_free()`. `app.shutdown()` clears checkpoint state; it does
not destroy the static server context that owns the model and inference context. An actual
512-token full-GPU baseline control confirmed that explicit GPU destruction did not advance
during acknowledged native exit: 1,267,992,968 created GPU-buffer bytes still had no `destroy()`
call. Native allocator-live bytes fell from 79,907,816 to 59,675,360, consistent with clearing
the checkpoint without releasing the owner. These are call/allocator observations, not proof
of physical residency or the cause of a phone kill.

The separate source-built candidate explicitly destroys and reconstructs that static owner
before backend shutdown. Its Wasm is `065354247ab2a35b58cdfc909bfcf66367b715bee53a0e72856be89ddc235aaa`
(14,417,422 bytes); it validates and preserves the baseline imports and exports. The source
patch/profile are `ops/native/native-owner-cleanup.patch` and `ops/native/native-owner-cleanup.json`.
They are experimental and are not selected by either deployed app.

A matched zero-layer-offload control on RTX 5060 used the same cached 1,202,488,640-byte model,
4096-token context and identical seven-token reply. Baseline exit left 909,492,736 allocator-live
bytes and 419,445,640 GPU-buffer bytes without explicit destruction. Candidate exit left
4,792,112 allocator-live bytes and 993,408 GPU-buffer bytes without explicit destruction.
Cleanup completed in 66 ms. Three further load/reply/unload cycles passed, including a second
exit call in each cycle; post-cleanup values stayed about 4.8 MB and 1 MB respectively. See
[the matched ownership receipt](evidence/native-owner-cleanup-control.json).

This is a resource-ownership correction, not full release qualification. The linear-memory
capacity remains at its high-water mark until worker disposal; no physical RSS drop is claimed.
Full-GPU sustained operation, repeated navigation, cancellation, offline operation and the actual
iPhone remain to be checked. The wrapper now also recognizes the native C error receipt
`{"error":true}` as failed cleanup rather than an acknowledgement; all 59 JavaScript checks pass.

### Desktop cold-load error capture and shared GPU admission

A fresh deployed preview install reproduced the load fault with an explicit Wasm `Aborted()`
error; its temporary profile was deleted. A later instrumented fresh install completed 7 and
512 tokens, recorded native cleanup, removed the model and deleted its profile. This does not
retroactively establish the earlier fault's cause.

A separate attested baseline control captured `VK_ERROR_OUT_OF_DEVICE_MEMORY` while creating
`tensor_buf0`, followed by invalid-buffer errors. The selected 16 GB GPU had only about 1.1 GB
free after the failure while shared workloads occupied it. Those workloads were left alone.
A later baseline trial admitted with about 5.9 GB free passed 512 tokens; the first full-GPU
candidate trial was skipped by its headroom preflight, and a bounded capacity wait ended without
starting a browser. See [the device-error receipt](evidence/desktop-device-allocation-error.json).

The raw stack was resolved using the symbol file produced with the attested native binary:
function 7373 is the WebGPU uncaptured-error callback. The wrapper's historical embedded map
reported a different name. Preserve raw function indices and resolve against the matching
artifact; do not use that stale decoded name as evidence of a speculative-decoding failure.
The captured desktop Vulkan allocation error and the phone's kernel 2 GB process-limit kills
remain distinct observations.

### Development owner-cleanup candidate selected

The development derivative selects native build `privatelocalchat-owner-cleanup-debug-20261030-v1`
and compiler-control variant `privatelocalchat-owner-compiler-control-20261030-v1`, Wasm SHA-256
`77d16dd0a2ba93b504ae2c799ed1ae4e3eebefd834dbb74ed9245287abd146af`. Its 51-body transform
reconstructs exactly to the new source-built `6544e252…` baseline. Three desktop full-GPU
load/generate/unload cycles completed 512 tokens each with no recorded errors. All 63 repository
checks pass, including production exclusion of the new diagnostic client path.

Native device errors now forward immediately through the existing consent-controlled full-object
channel. A synthetic GPUValidationError delivered to the actual native device handler caused a
real native abort; the actual Cloudflare receiver retained the complete error object with a
verified SHA and no missing parts. See [the stream receipt](evidence/native-device-error-stream.json)
and [the candidate receipt](evidence/dev-owner-cleanup-candidate.json). Compatibility symbol names
are regenerated from this native link, and the symbol input and tool are pinned in the manifest.

Next: publish and read back this dev candidate, then qualify sustained operation, cancellation
and offline reopening on the actual iPhone. The clean production artifact remains separate;
production promotion and overall acceptance remain open. The Mac/phone disconnect required
restoring our SSH USB forward; fresh trusted pairing, inspector listing and an iPhone JavaScript
evaluation succeeded afterward. The earlier namespace inspection timed out and did not prove
that the retained model cache was reclaimed or reusable.

### Deployment and renewed iPhone trial

The owner-cleanup candidate deployed to dev in commit `663646db` (Actions run 41072165946).
The subsequent download-read timeout fix deployed in `94265041` (run 41078969621); all 64
JavaScript tests passed. The timeout bounds an otherwise indefinite stream read and lets the
existing recovery loop retry. Its test simulates a stalled stream; it does not prove the cause
of the slow iPhone transfer.

After the authorized device restart, the phone reported 2,412,232,704 bytes immediately
available. An owned Safari automation session loaded `663646db`, enabled diagnostics, and began
one model download with device memory recording. The transfer has been unusually slow but has
advanced. The current page predates the download timeout fix. Loading, sustained generation,
cancellation and offline reopening remain unverified on this candidate; do not promote it on
this evidence alone. The retained older automation storage namespace was accessible through
instrumentation, but its reclamation or reuse has not been established.

### Production and development release

At the request to serve the latest application on both domains, commit `5fc35bb` deployed to
both production and development (Actions runs 41081605157 and 41081624775). Production serves
clean owner-cleanup Wasm SHA-256 `065354247ab2a35b58cdfc909bfcf66367b715bee53a0e72856be89ddc235aaa`;
development serves the instrumented compiler-control derivative `77d16dd0a2ba93b504ae2c799ed1ae4e3eebefd834dbb74ed9245287abd146af`.
Both deployed artifacts were read back and verified. The application suite passed 64 tests;
production diagnostic route returned 404. Earlier statements that production remained unchanged
were accurate at their time but are superseded by this release. The iPhone gate remains open:
the real-device trial had not yet completed model download when this release was published.

### iPhone owner-cleanup trial and release reload

On iPhone 15 Pro, the owned Safari session on `663646db` finished the 1,202,488,640-byte
model download and automatically loaded the development owner-cleanup runtime in 4.7 seconds.
It completed a short reply and a subsequent 1,998-character reply. With the dev service worker
blocking network requests (radios remained on), a further reply completed; the cached app then
reopened, loaded all 13 cached shards in four seconds, and completed another reply. The network
fault was disabled afterward. These results do not establish production runtime or real airplane
mode behavior.

Navigating from that loaded offline-reopen session to the current dev release `5fc35bb` reused
all 13 cached shards, but two load attempts returned `InvalidStateError` before construction.
The page stayed responsive. The navigation occurred while the previous model was loaded; the
current evidence does not identify whether an old worker, a diagnostic journal handle, or another
resource caused the error. The earlier successful trial and this failure must both remain visible
in release assessment. Raw diagnostic and device-memory evidence stays in the private work area.

A third load on `5fc35bb` bypassed only the native construction recorder while leaving
telemetry disk storage enabled. It passed the immediate invalid-state point and reached native
construction, but phone telemetry stopped at 15:49:43 UTC and subsequent USB evaluations timed
out. The device sampler last saw WebContent PID 574 at 15:49:44 UTC, with a sampled peak
footprint of 1,969 MiB; it disappeared from later samples. PID attribution and the operating
system's reason have not been established, so this is evidence of a high-memory process
vanishing near the failure, not proof of a particular jetsam event. The phone test remains open.

The captured native logs show that both the successful `663646db` load and the later failed
`5fc35bb` load reached full 25-layer GPU offload and reported a 1,136.33 MiB model buffer.
The successful run recorded two generation completions at 15:43:23 and 15:44:15 UTC. The
matching reported buffer size does not establish equal total process memory or the cause of
the later process disappearance.

Both live domains at `5fc35bb` passed desktop Chromium smoke checks using the light model on
Centroid's 8 GB GPU: online generation, offline generation, and a full browser reopen while
offline followed by another reply. Development produced no page errors or unexpected
requests. The production and development releases use different native artifacts, and neither
of these desktop results proves the current production artifact on iPhone.

### Current release iPhone check

On a new iPhone automation session, current dev release `5fc35bb` downloaded the light model
and loaded it automatically on the first attempt in about five seconds. It completed two
consecutive prompts, including a 2,523-character second response, and then a third prompt with
the dev service worker denying network requests. The model remained ready; network denial was
subsequently disabled. This was an in-session simulated-offline check, not an airplane-mode or
production-origin iPhone test. The live production and dev sites have separately passed desktop
online, offline, and full-browser offline-reopen checks.
