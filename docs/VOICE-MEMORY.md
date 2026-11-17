# Memory of the two voice engines

Measured on 2026-11-02 on one Linux desktop (16 cores, 62 GB RAM) with Chromium 151 in new headless mode, by `ops/voice/measure-memory.mjs`.
Raw numbers: `docs/evidence/voice/memory-measurements.json`. Re-run with `node ops/voice/measure-memory.mjs`.

Each run starts a fresh browser, opens the built app idle in API mode, installs the voice from the hosted files, loads it, speaks one short
sentence (warm-up), then speaks about a minute of text (3 paragraphs: 70 s of audio for Kitten, 50 s for Kokoro), unloads and removes. Extra memory
below means "value minus the same page before anything voice-related happened". The unit is MB.

## Results (extra memory over the idle app page)

| Engine, ONNX Runtime threads | After `load()` | Peak while speaking | After `unload()` | After `remove()` | Real-time factor |
|---|---|---|---|---|---|
| Kitten nano int8, 1 thread | RSS +212, UASM +143 | RSS +251 (PSS +250), UASM +231 | RSS +14, UASM +2 | RSS +10, UASM +2 | 3.9 |
| Kitten nano int8, 4 threads | RSS +222, UASM +145 | RSS +267 (PSS +266), UASM +234 | RSS +253 (!), UASM +1 | RSS +10, UASM +1 | 7.3 |
| Kokoro q8, 1 thread | RSS +391, UASM +271 | RSS +421 (PSS +419), UASM +380 | RSS +18, UASM +2 | RSS +13, UASM +2 | 1.05 |
| Kokoro q8, 4 threads | RSS +401, UASM +272 | RSS +389 (PSS +388), UASM +382 | RSS +325 (!), UASM +1 | RSS +14, UASM +1 | 2.2 |

RSS is the resident set of the page's renderer process (it holds the page, the voice worker and the ONNX Runtime thread workers). UASM is
`performance.measureUserAgentSpecificMemory()`. The idle app page itself is about 160 MB RSS / 3 MB UASM. Peak RSS for the 1-thread Kokoro run sits
close to its value after load, so most of the cost is the model and runtime, not the synthesis.

Peak extra, rounded up: **Kitten about 270 MB, Kokoro about 420 MB** (RSS, the larger figure of the methods). More threads cost little extra memory
(about +15 MB for Kitten) but synthesise about twice as fast here.

Two things worth knowing:

- With 4 threads the renderer kept its memory for the 2 s measured after `unload()` (RSS +253 and +325) and gave it back only by the time `remove()`
  had finished (+10 / +14). So the memory is returned, but not instantly; the 1-thread runs returned it within 2 s.
- The browser also keeps an extra spare renderer process (about 70 MB) that is not part of these figures. Total browser RSS, all processes, peaked
  at about 1.03 GB (Kitten) and 1.25 GB (Kokoro) here; the idle total is about 0.77 GB. That includes the GPU and utility processes.

## Methods, side by side, and their limits

| Method | What it saw | Limit |
|---|---|---|
| `/proc/<pid>/status` VmRSS and VmHWM, `smaps_rollup` Pss of the page's renderer process | Everything the operating system holds resident for the page: JS heap, WebAssembly memory, ArrayBuffers, ONNX Runtime thread workers | Linux only; includes shared library pages; the allocator can keep freed memory resident; the page's renderer is identified as the process that grew when the voice loaded (the browser keeps a spare one). VmHWM is a lifetime peak of the process, so it cannot be compared across phases. Sampled every 100 ms, so very short spikes can be missed. |
| `performance.measureUserAgentSpecificMemory()` | JS and WebAssembly memory of the page and its same-origin workers, attributed per worker script (the voice worker held 141 MB after load for Kitten) | Not available in Playwright's headless shell (answers SecurityError); needs a full Chromium. Chrome answers each call after a random delay, and calls started together are answered by one measurement, so the "during speech" figures are one reading near the end of the window, not a continuous peak. Each call forces a garbage collection. Excludes native memory outside the page. |
| CDP `Runtime.getHeapUsage` (page and the voice worker) | V8 heap only: 4 to 13 MB in every phase | Does not count WebAssembly memory or ArrayBuffer backing stores, which is where the model lives. Useless for this question; kept to show that. |
| CDP `Performance.getMetrics` (page) | JS heap and DOM counters of the page only | Page only, not workers. |
| CDP `Memory.getDOMCounters` | Document, node and listener counts | No bytes. |

Attaching the DevTools protocol to the ONNX Runtime thread workers (`ort-wasm-simd-threaded.mjs`) wedged the first synthesis in 4-thread runs, so the
script only counts those workers and does not attach to them. This is a property of the measurement, not of the app.

## What is not captured

- **No local chat model was loaded.** None can be loaded on this machine, so the page is the idle app in API mode. Everything above is the
  voice's cost on top of an idle page, not the cost beside a loaded 2B chat model. WebGPU buffers of a chat model live in the GPU process and in
  the same renderer; how they interact with the voice's WebAssembly memory is unmeasured.
- Linux desktop x86-64 only. Android Chrome, iOS WebKit and Firefox may allocate differently (WebKit and Chrome on phones have per-process limits that
  RSS here says nothing about).
- Memory while the text is long: three paragraphs (about 800 characters). Longer replies are spoken chunk by chunk, so the peak is not expected to
  grow with length, but that was not tested.
- One machine, one run per configuration; no variance estimate.

## Recommended `needGB` for `loadPolicy`

`loadPolicy` currently assumes 1.2 GB (Kokoro) and 0.5 GB (Kitten). Measured peak extra was 0.27 GB and 0.42 GB. With a margin of about 1.5 to 2
for the unmeasured differences above:

| Engine | Measured peak extra | Recommended `needGB` | Current |
|---|---|---|---|
| Kitten nano int8 | 0.27 GB | **0.5 GB** (keep) | 0.5 |
| Kokoro q8 | 0.42 GB | **0.8 GB** | 1.2 |

Lowering Kokoro from 1.2 to 0.8 is justified by the data, but the old figure was not wrong as a safe value; keep 1.2 if the policy is meant to
stay conservative until a phone has been measured.

## Could a 4 GB or 6 GB phone hold a voice beside a 2.3 GB chat model? (inference, not measurement)

Arithmetic only. 2.3 GB for the chat model plus 0.3 to 0.45 GB for a voice, plus the page and browser (about 0.2 to 0.4 GB), is 2.8 to 3.2 GB for
the browser's use.

- **4 GB phone:** the operating system and other apps usually leave 1.5 to 2.5 GB to one browser. The chat model alone nearly fills it, so adding either
  voice is implausible, and the voice would more likely get the tab killed than succeed.
- **6 GB phone:** about 3 to 4 GB is typically available to one app. Kitten (+0.27 GB) plausibly fits beside the chat model; Kokoro (+0.42 GB) is
  borderline and depends on the browser's per-tab limit.
- **iPhone (any RAM):** WebKit's per-process limit (about 2 GB on the phone that was investigated, see `docs/IPHONE-INVESTIGATION.md`) is below the
  chat model plus a voice, so a voice beside the chat model is implausible there. Using a voice with no chat model loaded is a different case
  that these desktop numbers suggest is feasible (an idle page plus a voice is about 0.4 to 0.6 GB RSS) but that has not been measured on a phone.

To turn any of this into a measurement, run `ops/voice/measure-memory.mjs`-style sampling on the device itself (for example
`performance.measureUserAgentSpecificMemory()` from `ops/voice/lane/cdp-eval.mjs` against the phone's Chrome) with the chat model loaded.
