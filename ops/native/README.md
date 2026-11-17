# Development native checkpoints

The diagnostic compatibility runtime derives from the pinned product-slim v1q native
sources. Its only source changes are the build identity and numeric PRE/POST checkpoints
in `iphone-tail-diagnostics.patch`. Model files, load wire (69 request / 23 response fields),
context, batch sizes, kernel policies, and checkpoint ownership are unchanged.

`dev-tools/native-runtime/manifest.json` binds the source-input hashes, patch hash, compiler
release, and published artifact sizes/hashes. The build uses Emscripten 4.0.20, compatibility
Wasm32/Asyncify, WebGPU, product-slim, and the same 96 MiB link-time floor as the base runtime.
The application continues to request its existing 128 MiB initial runtime memory.

To rebuild from the corresponding pinned source tree and an Emscripten 4.0.20 SDK:

```sh
python ops/native/build-debug-runtime.py \
  --source /path/to/pinned-native-source \
  --toolchain /path/to/emscripten-4.0.20/install \
  --node /path/to/node \
  --workdir /path/to/new-isolated-build
```

The script verifies source and patch pins, copies into a fresh directory, applies the patch,
and builds there. It preserves the input checkout and active SDK configuration. Generated
artifacts are written under the isolated build's `runtime/`; compare their manifest before
replacing the checked-in dev artifacts. Keep upstream MIT/BSD notices with distributions;
the unchanged notices remain in the normal vendored runtime directory.

Only `dev` builds overlay these three files and the expected runtime identity. Production
builds retain the original runtime bytes, including after a source promotion. Unit checks
verify both artifact identities. The debug runtime paths are served only on the exact
`dev.privatelocal.chat` hostname. The compatibility build is the app's existing forced path;
the untouched default Wasm is not part of this diagnostic variant.

Phase 11 fences cover the post-graph native loading path:

| Operation | Boundary |
| --- | --- |
| 1 | Sequence-removal capability check |
| 2 | Initial memory clear |
| 3 | Two-token capability decode |
| 4 | Partial-sequence removal |
| 5 | Final memory clear |
| 6 | Capability-check synchronization |
| 7 | Common model/context initialization |
| 8 | Slot reset |
| 9 | Batch initialization |
| 10 | Server initialization |
| 11 | Chat-template parsing |
| 12 | Chat-template example formatting |
| 13 | Native load-model wrapper |
| 14 | Final GPU upload drain |
| 15 | Metadata receipt construction |

Phase 12 covers graph allocation (1), split allocation (2), split computation (3), async
graph computation (4), and backend synchronization (5). Those additional graph fences stop
when native readiness is reached. Edge 1 is PRE and edge 2 is POST. Counters are allocation
observations rather than process RSS. A last PRE identifies an interrupted interval, not a
confirmed OS memory-kill diagnosis.

The compatibility worker also connects its actual WebGPU buffer/pipeline creation sites
to the existing post-Ready counters. `instrument-webgpu.mjs` applies this transformation
after compilation and refuses ambiguous sites. These counters measure cumulative creation,
not live residency or process RSS. Earlier dev builds defined the counters without calling
them; their zeros do not establish an absence of post-Ready allocations. The production
worker remains unchanged.

The queue variant applies `iphone-queue-bound.patch` after the tail patch and
uses build identity `privatelocalchat-queue-20261029-v2`. The manifest pins both
patches and the additional original backend source. Its default profile submits
32 kernels per batch, limits outstanding graph batches to two across graph
boundaries, and waits for queue completion at each graph end. The default backend
previously had an unlimited configured maximum.

Same-binary laboratory controls use Emscripten ENV `PLC_WEBGPU_MAX_INFLIGHT`
(0 selects the unbounded control; default 2) and `PLC_WEBGPU_SUBMIT_BATCH`
(default 32). They are not product UI settings. Generation diagnostics expose
`webGpuQueue`: submitted and explicitly completed graph batches, pending count,
in-flight high-water, wait count/time, graph evaluations, and actual policy values.
These are command-accounting counters, not physical GPU memory measurements.
Phase14/op1/POST stores a sparse summary every16 graphs: operationSerial=graph
count; slots176/184/192/200=submitted/completed/waits/in-flight high-water.

See `docs/evidence/dev-queue-policy.json` for the same-binary real-GPU comparison.
All three arms completed the retained workload; the bounded arms attested maximum
two outstanding graph batches and zero pending batches at generation completion.
iPhone retained-operation qualification remains open.

## Development compiler control

The development manifest selects `privatelocalchat-compiler-control-20261030-v1`.
Its native build string remains `privatelocalchat-queue-20261029-v2`; its distinct
Wasm SHA-256 is `dbaf064fbeefcae1ab86322a9e52b2fc0de2e52e1f9e00cf72a787ed1f1142fc`.
The worker and wrapper bytes, model files, placement, context, queue policy and
checkpoint settings retain the baseline behavior.

This experiment adds branch-skipped padding to 51 bodies originally larger than
20,000 and at most 100,000 bytes. Each selected body reaches 160,000 bytes, beyond
WebKit's current OMG optimizing compiler candidate-size limit. It is a diagnostic
intervention for measured delayed compiler allocation, not a permanent mitigation
or an established iPhone fix. The Wasm download grows from 14,430,107 to 20,671,361
bytes; downloaded model files are reused.

`compiler-control.json` records the exact baseline, output, and changed function
indices. With the pinned baseline artifact available locally:

```sh
node ops/native/compiler-control.mjs pad /path/to/baseline/compat.wasm /path/to/output/compat.wasm
node ops/native/compiler-control.mjs verify /path/to/output/compat.wasm /path/to/output/manifest.json
```

The tool refuses a different baseline. Verification removes every added block,
checks that each block branches over only nops, reconstructs the original module,
and requires its full hash to match the baseline. It also checks Wasm validity
and unchanged imports/exports. This verifies that data, exports, and unrelated
code were preserved. The script derives from the upstream MIT-licensed compiler
reproduction; its license and attribution are retained beside it.
Function indices remain stable, but code offsets change; baseline offset-based
source maps must not be treated as accurate for the transformed artifact.

The native rebuild script applies the same transform after compiling the baseline
when the manifest selects this control, and rejects a different output hash. Site
builds verify the tool pin, transformation receipt, and reconstructed baseline.
`version.json`, the dev diagnostics panel, and startup/configuration diagnostic
events carry the variant and full Wasm hash. The variant is metadata separate
from the unchanged native build string. Production builds omit this metadata and
continue to use their separately pinned native bytes.

See [the living investigation](../../docs/IPHONE-INVESTIGATION.md) for the
qualification sequence, current deployment status, and physical-device gate.

`qualify-compiler-control.mjs` runs real Chromium/Vulkan checks against a local dev
build or the published dev site. Set `PLC_QA_PROFILE` to an owned persistent
Chromium profile where the verified 2B model is already installed, and
`PLC_DEBUG_SESSION_FILE` to a private operator-created browser diagnostic session
JSON file. Keep the phone's diagnostic session separate. `PLC_QA_BROWSER` may
select a compatible Chromium executable; `PLC_QA_GPU` selects the Mesa Vulkan
device. These operator settings are not site settings.

`PLC_QA_MODE=parity` compares the pinned baseline and candidate across three
retained turns. `PLC_BASELINE_WASM` selects the baseline artifact; the default is
`work/compiler-baseline/compat.wasm`, which must have the pinned source hash.
`PLC_QA_MODE=endurance` runs ten retained full-GPU turns, an actual 512-token
completion, cancellation/recovery, a fresh context without reloading weights,
offline generation, and a 30-second hold. `PLC_QA_MODE=phone-profile` repeats that
sequence with zero layer offload and the tied GPU head on desktop hardware;
it does not emulate iOS. Both graph profiles explicitly disable flash attention
to exercise the phone's non-flash path. `PLC_LIVE=1` uses the deployed site;
otherwise the tool serves `dist/` through Playwright routes on the dev origin.
Raw results default to ignored `work/evidence/`; `PLC_QA_OUTPUT` can change that.
Published parity uses the previously qualified local baseline receipt, selected
by `PLC_BASELINE_RECEIPT` or `work/evidence/compiler-candidate-parity.json`. It
refuses a missing baseline and compares live output to that independent record.

## Production native runtime

`production-runtime.json` pins the production artifacts, original source inputs, wrapper
and queue patch. It uses two in-flight graph batches, 32 kernels per submission and
queue completion at each graph end. The full 4096-token window remains available.

Rebuild with the pinned Emscripten 4.0.20 toolchain in a new isolated directory:

```sh
python3 ops/native/build-debug-runtime.py \
  --manifest ops/native/production-runtime.json \
  --source /path/to/pinned/wllama \
  --toolchain /path/to/emscripten-4.0.20/install \
  --node /path/to/node \
  --workdir /path/to/new-output
```

The script verifies source and wrapper hashes before applying the patch. Despite its
legacy filename, the selected production manifest disables development instrumentation.
Only the three pinned runtime files are copied into the app. Operator scripts and
profile manifests are not served by the site. Preserve upstream notices in the vendor
directory. Development uses a separate instrumented artifact.

See `docs/evidence/production-queue-candidate.json` for local real-browser checks.
Those checks do not establish iPhone reliability or a production deployment.

## Clean compiler-control preparation

`production-compiler-control.json` records an experimental transform of the independently pinned
clean production queue artifact. It is **prepared, not selected or deployed**. The native wrapper
and worker remain the clean production versions, and the changed module reconstructs exactly
to their 1bf7ed18 baseline. The development transform still reconstructs to its a772105a baseline;
the tool accepts only these two pinned sources. Both select 51 bodies with unchanged interfaces.

Reproduce the clean candidate outside served build output:

```sh
node ops/native/compiler-control.mjs pad runtime/providers/vendor/wllama/v1q/compat.wasm work/production-compiler-control/compat.wasm
node ops/native/compiler-control.mjs verify work/production-compiler-control/compat.wasm ops/native/production-compiler-control.json
```

This preparation leaves `production-runtime.json` and shipped native files unchanged. Qualify
correctness, performance, resource behavior and the physical device gate before deciding whether
this workaround belongs in a production selection. Promoting source alone currently selects the
clean untransformed production runtime; do not mistake a dev runtime result for that selection.

## Experimental model-owner teardown

`native-owner-cleanup.json` and `native-owner-cleanup.patch` prepare a separate source-built
compatibility artifact. The patch includes the existing production queue policy and changes
`wllama_exit` to destroy and reconstruct the static model owner after checkpoint cleanup,
before backend shutdown. The profile also pins `cpp/wllama.cpp`, which contains that exit entry.
Rebuild with `build-debug-runtime.py --manifest ops/native/native-owner-cleanup.json` and the
other source/toolchain/workdir arguments above. Keep this candidate separate from selected
production and development artifacts. No compiler padding is applied to this candidate.

The matched allocator/GPU destruction control and repeated short lifecycle results are in
[the ownership receipt](../../docs/evidence/native-owner-cleanup-control.json). They establish
a cleanup improvement in the tested desktop control. They do not establish full-GPU endurance,
physical GPU reclamation, safe navigation, offline behavior or an iPhone fix. Preserve native
function indices and resolve them with the symbol file generated for the attested Wasm;
the wrapper's inherited compressed symbol list is not a reliable map for rebuilt artifacts.

The development owner-cleanup derivative is recorded in `dev-owner-cleanup.json` and selected
by `dev-tools/native-runtime/manifest.json`. Its additional owner patch is pinned and applied
after the diagnostic and queue patches. The existing compiler intervention is retained against
its new, explicitly pinned baseline. `native-symbols.mjs` refreshes the compatibility map from
the exact link symbol file; both inputs are pinned. Device-error forwarding is bounded to eight
8,192-character objects per worker, preserves the original native error callback, and uses the
existing full-content consent policy. It is absent from production builds.
