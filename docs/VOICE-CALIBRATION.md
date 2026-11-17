# Voice calibration: simulated slower CPUs

Raw data: `docs/evidence/voice/calibration-throttling.json`. This note is the analysis and the values put into `VOICE_CONFIG` (`runtime/voice-pick.mjs`).
The thresholds are **advice thresholds**: they decide the "recommended for this device" and the "may be slow here" wording, not what a person may download.

## Method, and what it is not

- The task asked for `Emulation.setCPUThrottlingRate`. It was applied and **does not work for this question**: Chromium refuses it for workers ("Operation is only supported for pages, not workers"), and the probe and both engines run in workers. At rates 1 to 20 the worker probe stayed at 134 to 151 ms while a main-thread loop slowed from 38 to 715 ms (`cdpThrottleOnly` in the JSON).
- What was used instead: **CPU contention**. The whole run is pinned to 4 logical CPUs and k busy-loop processes are pinned to each, so every thread gets 1/(k+1) of a core (nominal slowdown 1, 2, 4, 6, 8, 12, 20). The measured probe medians confirm it (138, 276, 549, 859, 1095, 1685, 2976 ms: 2.0x to 21.6x).
- Limits of the approximation: it slows compute only (not memory bandwidth, cache or big.LITTLE scheduling); with 4 ORT threads, contention also stalls threads that wait for each other, so the engines fall faster than the single-threaded probe rises. A second sweep with 1 engine thread is included. The machine was shared (load about 12 on 16 CPUs).
- For each rate: the real `runComputeProbe` 5 times, then each engine: load, one cold speak, one warm speak of the test sentence (7.91 s of Kitten audio, 5.03 s of Kokoro audio, the same text as the lane results), and `startDelayMs` for a 20 s reply.

## Results (warm run, 4 engine threads = the app default)

| Slowdown | Probe median (5 runs) | Kitten x real time | Kitten first audio | Kitten start delay, 20 s reply | Kokoro x real time | Kokoro first audio | Kokoro start delay, 20 s reply |
|---|---|---|---|---|---|---|---|
| 1 | 138 ms | 7.51 | 0.44 s | 0.4 s | 2.48 | 0.95 s | 0.9 s |
| 2 | 276 | 2.35 | 1.5 s | 1.5 s | 0.90 | 2.5 s | 4.7 s |
| 4 | 549 | 1.01 | 3.4 s | 3.4 s | 0.42 | 5.4 s | 32.9 s |
| 6 | 859 | 0.74 | 4.6 s | 11.8 s | 0.28 | 7.9 s | 59 s |
| 8 | 1095 | 0.58 | 6.0 s | 20.5 s | 0.22 | 10.4 s | 82 s |
| 12 | 1685 | 0.39 | 8.7 s | 40 s | 0.13 | 18.1 s | 155 s |
| 20 | 2976 | 0.23 | 14.9 s | 81 s | 0.087 | 25.3 s | 235 s |

With 1 engine thread: Kitten 4.21 / 1.98 / 0.97 / 0.46 / 0.31 / 0.19 and Kokoro 1.08 / 0.54 / 0.26 / 0.13 / 0.077 / 0.050 at slowdown 1 / 2 / 4 / 8 / 12 / 20.

## The relation between probe ms and real-time factor

Real-time factor times probe ms is nearly constant: factor = C / probe.

| | slowdown 4 to 20 (4 threads) | 1 thread | real desktops (probe 137 to 216 ms) |
|---|---|---|---|
| Kitten C | 555 to 694, about 640 | 511 to 545, about 520 | 711 to 752 (5.49x at 137, 4.78x at 150, 3.29x at 216) |
| Kokoro C | 215 to 260, about 235 | 126 to 150, about 140 | 300 to 317 (2.31x at 137, 2.00x at 150) |

Cross-check against the one real slow device: the Galaxy S8+ read a probe of 1,997 to 4,000 ms (4,000 is the cap, so the true value may be higher) and Kitten ran at 0.257x. The fit with C = 640 predicts 0.32x at 2,000 ms and 0.16x at 4,000 ms; the measured 0.257x lies between, and the simulated slowdown 20 (probe 2,976 ms) gave 0.23x. The simulation and the real phone agree within the probe's own spread. The desktops sit about 10 to 20 percent above the fit (more threads help at low slowdown), so the fit is the conservative side. Kitten first audio is about 5 to 6 times the probe ms; Kokoro about 8.5 to 10 times.

For a 20 s reply, `startDelayMs = 20 s x probe / C - 20 s + first audio`. Setting it to `maxStartDelayMs` (10 s):

| | probe limit (4 threads) | probe limit (1 thread) |
|---|---|---|
| Kitten (C 640 / 520) | about 820 ms | about 670 ms |
| Kokoro (C 235 / 140) | about 317 ms | about 190 ms |

## Probe run-to-run spread

Within a slowdown the 5 probe runs differed by 2.6 to 10 percent (max minus min over the median); the 5-run median was stable to the same range. That is a quiet machine. The only real jitter on record is the Galaxy S8+ (1,997 and 4,000 ms), which includes the cap, so it is a lower bound of the spread. `runComputeProbe` now returns the median of 3 runs (with `samples`), which removes one outlier run; it cannot remove a systematic difference such as a phone that throttles for the whole probe. Time cost: 0.46 s wall on this desktop (3 runs, each with its own worker; the probe itself is 137 ms per run); at a probe of 500 ms about 1.6 s; a slow phone stops early (a run of 1.9 s or more leaves no budget for a second) and the call is bounded by the same hard 4,000 ms timeout as before.

## Recommended values

| Key | Old | New | Reasoning |
|---|---|---|---|
| `probeMaxMs` | 800 | **500** | Kitten fit limit 820 ms (670 ms with 1 thread). A factor of 1.35 to 1.64 below it covers device differences the simulation cannot show (memory, scheduling) and the probe spread. The old 800 ms was at the fit limit, with no margin. All desktops (137 to 216 ms) pass with 2.3x room; the S8+ is 4x above. |
| `qualityProbeMaxMs` | 160 | **200** | Kokoro fit limit 317 ms (190 ms with 1 thread). 200 ms is 1.6x below the 4-thread limit and about at the 1-thread limit. The measured desktops (137, 150 ms, Kokoro 2.31x and 2.00x) pass with 1.3x or more; the old 160 was 7 percent above the 150 ms machine. A device at 216 ms (the N100) is above it, so it is advised Kitten. |
| `minRealTimeFactor` | 0.5 (placeholder) | **0.7** | Derived, not measured: 20 s of speech waiting at most 10 s implies a factor of 20/30 = 0.67, so 0.5 never mattered. The sweep crosses it between slowdown 4 (Kitten 1.01) and 6 (0.74, where the start delay already fails). |
| `maxFirstAudioMs` | 4000 (placeholder) | **4000** | At the probe limits first audio is about 2.7 s (Kitten at 500 ms) and 1.9 s (Kokoro at 200 ms); 4,000 is 1.5x or more above them. The value is kept, now with a reason. |
| `maxStartDelayMs` | 10000 (placeholder) | **10000** | A policy value (how long a person should wait for a 20 s reply). The data gives the consequence (the probe limits above), not the value. |

Still placeholders and not supported by this data: `minMemoryGB`, `minCores`, `minFreeStorageMB`, `storageHeadroomFactor`, `qualityMinMemoryGB`. No mid-range phone was measured. The simulation covers the middle of the probe range (277 to 3,000 ms), the fleet does not, so the margins above are the honest guard until one is.

## Why Kokoro read 0.56x to 0.86x in the spike and 2.0x to 2.7x in the engine runs

Measured, one factor at a time, on this machine:

1. **Our pipeline** (worker, `chat/voice/voice-engine.mjs`), no slowdown: 1 thread 0.98x to 1.15x; 4 threads 2.1x to 2.8x; 8 threads 2.4x to 2.7x. Sentence length 2.3 s, 5.2 s, 9.6 s and 20.2 s made no difference (1.04x to 1.15x at 1 thread). Warm-up: the first run of a text is about 5 percent slower than later ones. Not the cause. Threads matter (x2.4 from 1 to 4) but the spike also tried 1 and 8.
2. **The spike code re-run** (kokoro-js 1.2.1 on transformers.js 3.8.1, the same model file, this machine): 1 thread 0.53x to 0.56x, 4 threads 0.82x to 0.89x, 8 threads 0.78x to 0.87x. That reproduces the spike (0.56 and 0.86).
3. **The same kokoro-js code with ONNX Runtime Web 1.31.1** swapped in (the version the app vendors; kokoro-js bundles 1.22.0-dev from April 2025): 1 thread 1.02x to 1.08x, 4 threads 1.8x to 2.6x, 8 threads 1.6x to 2.2x. That equals our own pipeline.

So the cause is the **ONNX Runtime Web version**: 1.31.1 is about 1.9x faster than the bundled 1.22.0-dev with 1 thread and 2.5x to 3x with 4 threads (its int8 kernels for this model). The pipeline (phonemizer, tokenizer, splitting) and the text length are not the cause. Consequence for the plan: the old line "a 16-core CPU ran Kokoro at 0.56x to 0.86x" describes an old runtime and should not be used to rule Kokoro out on CPU; the app's own runs (2.0x to 2.3x on desktops) are the relevant numbers. `docs/VOICE-ENGINE-PLAN.md` was not edited in this change.
