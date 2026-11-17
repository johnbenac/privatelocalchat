# Voice runtime: on-device text-to-speech engine (Kitten TTS nano 0.8 int8)

Status: wired into the app. `chat/voice/voice-choice.mjs` (the controller behind the voice picker) creates the engines, `chat/voice/speech.mjs` routes speech to the selected voice, and the voice pill and Settings > Voice manage them. The plan is `docs/VOICE-ENGINE-PLAN.md`.

## Parts

| File | What it is |
|---|---|
| `chat/voice/voice-engine.mjs` | Main-thread client: `createVoiceEngine({baseUrl, fetchImpl, workerUrl, manifest?})` returning `{status, install, remove, load, unload, speak, sample}`. |
| `chat/voice/voice-kitten.mjs` | Pure Kitten pipeline pieces (symbol table, tokenizer, chunking, npy/npz parsing, voice/speed/style/trim). Node-testable. |
| `chat/voice/voice-manifest.mjs` | Pinned names, sizes and SHA-256 of the three model files. |
| `chat/voice/voice-kokoro.mjs`, `chat/voice/voice-manifest-kokoro.mjs` | The Kokoro pipeline and its pinned file set (see the Kokoro section). |
| `chat/vendor/voice/` | The bundle: `worker.js` (Kitten), `worker-kokoro.js` (Kokoro), the shared `ort-wasm-simd-threaded.mjs` and `.wasm`, `VERSIONS.json`, `VERSIONS-kokoro.json`, and a `.LEGAL.txt` per worker. |
| `ops/voice/` | `package.json` + `package-lock.json` (pinned build inputs), `worker.src.mjs`, `worker-kokoro.src.mjs`, `build-worker.mjs`, `gen-kokoro-golden.mjs`. |
| `tests/voice-engine.test.mjs`, `tests/e2e/voice-engine.e2e.mjs` | Unit tests (plain node) and the real-browser test with the real model. |

## API

- `status()` (async) -> `{id, installed, bytes, totalBytes, loaded, loading, installing}`. `installed` is true only when the marker file exists and every file has its pinned size.
- `install(onProgress)` downloads the three files from `baseUrl`, streams each through SHA-256 while writing it to OPFS directory `plc-voice-kitten-nano-0.8`, and refuses a size or hash mismatch (`error.code === "hash-mismatch"`), deleting the directory. Transient HTTP/network failures are retried with `runtime/providers/download-retry.mjs`. The progress callback gets `{file, loaded, total, overallLoaded, overallTotal}`. A marker file is written last.
- `load()` / `unload()` start and stop the worker (the model session). `remove()` unloads and deletes the directory.
- `speak(text, {onChunk, signal, speed, voice})` -> `{audioSeconds, synthSeconds, realTimeFactor, firstAudioMs, chunks}`. `onChunk({samples: Float32Array, sampleRate: 24000, index, count, text})` fires as each chunk is ready. One speak runs at a time. `voice` is an id or alias from `config.json` (default `Leo`); `speed` is multiplied by the voice's `speed_priors`.
- `sample()` speaks a fixed sentence and also returns the joined `audio`.

## Pipeline (matches the proven spike and KittenTTS 0.8)

text -> `chunk_text` (split at `.!?`, which are dropped; up to 400 characters, longer sentences packed by words; a comma is appended unless the chunk ends in `.!?,;:`) -> per chunk: split at punctuation `; : , . ! ? ¡ ¿ — … " « » " "`, phonemize each non-punctuation piece alone with `phonemize(piece, "en-us")` and put the marks back after the preceding word (the npm phonemizer drops punctuation, the reference uses `preserve_punctuation=True`) -> tokens `[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]` joined by single spaces (Unicode-aware: JavaScript's `\w` is ASCII only, which split every IPA sound into its own token and made the speech unintelligible) -> symbol index (178 symbols; unknown dropped) -> `[0, ...ids, 0]` int64 -> style row `min(len(chunk), rows-1)` of the voice, using the CHUNK length -> speed = speed x prior -> ONNX run -> drop the last 5000 samples -> 24 kHz float32. Synthesis is always one chunk at a time (whole-text inference fails in ORT).

Checked against KittenTTS's Python reference: `tests/fixtures/kitten-golden.json` holds reference phonemes and ids; the reference phonemes give identical ids for all 7 chunks and the npm phonemizer gives identical ids for 6 of 7 (it says `foːɹ` for "four" where the Python espeak build says `fɔːɹ`). The e2e output, transcribed with Whisper tiny.en, read back "The capital of France is Paris. This is a short test of on-device speech." (set `VOICE_WAV_OUT=/path.wav` to keep the audio).

## Limitations

- English only. KittenTTS's text pre-processor is ported in `chat/voice/voice-text.mjs` and applied before chunking (`speechChunks`): numbers, currency, percentages, times, ordinals, units, fractions, decades, phone numbers, IP addresses, ranges and contractions are spoken as words, and URLs, e-mail addresses and HTML tags dropped. As in the reference it then removes all punctuation and lower-cases, so a short text is one chunk (prosody comes from the model, not from sentence marks). Golden test: `tests/fixtures/kitten-preprocess-golden.json` (517 cases from the Python reference, regenerate with `ops/voice/gen-preprocess-golden.py`).
- Installing needs `FileSystemFileHandle.createWritable()` (Chromium, Firefox, Safari 26+). No fallback yet.
- The ORT WASM files in `chat/vendor/voice/` are excluded from the service worker's precache (`scripts/build.mjs`): they are cached on first use, not at install, so offline speech needs one online use of the worker first.
- The `.onnx`, `voices.npz` and `config.json` are hosted on the project's asset host, under the configured model source (`docs/APP-CONFIG.md`), in a folder keyed by the pinned Hugging Face revision (`docs/CDN-POPULATION.md`). A different `baseUrl` must point at a host that sends CORS and (under COEP) usable cross-origin headers.
- Threads: the worker uses up to 4 WASM threads when the page is cross-origin isolated, otherwise 1.
- No telemetry of any kind. The worker has no network access beyond loading its own bundle files; text never leaves the page.

## Rebuilding the bundle

    cd ops/voice && npm ci --ignore-scripts && cd ../.. && node ops/voice/build-worker.mjs

esbuild is a dev dependency of `ops/voice` only; the app imports none of the npm packages at run time (they are bundled into the worker). The script prints a SHA-256 line per produced file.

## Pinned inputs

| Package | Version | Licence |
|---|---|---|
| `onnxruntime-web` | 1.31.1 (plain SIMD threaded build only; `onnxruntime-web/wasm` with the extern-wasm condition) | MIT |
| `phonemizer` | 1.2.1 (wrapper labelled Apache-2.0; embeds a JavaScript build of espeak-ng and its data, GPL-3.0, no GPL text shipped inside the package) | Apache-2.0 + GPL-3.0 inside |
| `fflate` | 0.8.3 | MIT |
| `esbuild` (build only) | 0.28.2 | MIT |

## Produced files (SHA-256)

| File | Bytes | SHA-256 |
|---|---|---|
| `chat/vendor/voice/worker.js` | 1397602 | `3e4eaa8f6d409bf04687108a1e31d4fcaef7f1bc8f1c278bb7008d7c04043bde` |
| `chat/vendor/voice/worker-kokoro.js` | 1385131 | `422d1f5c3cf0a5f2199178205f8390bae762171eb09a0c6c4f386d7eb249275c` |
| `chat/vendor/voice/ort-wasm-simd-threaded.mjs` | 24738 | `30ed0b5cd1182ede931fea448afb567d4dc705ec957af09f108a2be5f770dac3` |
| `chat/vendor/voice/ort-wasm-simd-threaded.wasm` | 14848852 | `4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d` |
| `chat/vendor/voice/worker.js.LEGAL.txt` | 15878 | `d6998e6d5dba6cf091f83e532b1003314bcd7750cbfe308f81816e6ce7159655` |
| `chat/vendor/voice/worker-kokoro.js.LEGAL.txt` | 14616 | `edaff1302cb3b58b15bc21fe0690fd31b18dff723aa0ea2a49658486f77f9346` |
| `chat/vendor/voice/VERSIONS.json` | 298 | `5557f55d6153746d99be28842921f86181c0c50c5e8cd38b2aa8352ed1d7220a` |
| `chat/vendor/voice/VERSIONS-kokoro.json` | 332 | `5bced67cd9954e7a3524511a4712be2b27d7dc9fe4ff388ed83df4fc9ea933f7` |

## Model files (Kitten TTS nano 0.8 int8, `KittenML/kitten-tts-nano-0.8-int8`, Apache-2.0 on the card)

| File | Bytes | SHA-256 |
|---|---|---|
| `kitten_tts_nano_v0_8.onnx` | 24369971 | `f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc` |
| `voices.npz` | 3278902 | `8aa7cee235abb0739cb51e6559685f65a4dacd95568833d05699b1633f519b3f` |
| `config.json` | 688 | `b66006ccbeccd4de5fc3c9272059c47f5725df7215fd889785c03602652fab64` |

## Kokoro-82M q8 (second engine)

`createVoiceEngine({ engine: "kokoro", baseUrl: KOKORO_Q8_BASE_URL })` selects `KOKORO_Q8_MANIFEST` (`chat/voice/voice-manifest-kokoro.mjs`), OPFS directory `plc-voice-kokoro-q8` and the worker `chat/vendor/voice/worker-kokoro.js`. The default engine is still `"kitten"` and nothing about it changed (its `worker.js` is byte for byte the same). The API is the same (`status`, `install`, `load`, `unload`, `terminate`, `remove`, `speak`, `sample`); `speak(text, {voice, speed, onChunk, signal})` takes a voice id (`af_heart` default, `af_bella`, `af_nicole`, `af_sarah`, `am_michael`, `am_adam`, `bf_emma`, `bm_george`) or its name, and returns `{audioSeconds, synthSeconds, realTimeFactor, firstAudioMs, chunks}` with one `onChunk` per sentence.

- **Files.** The manifest has 12 files: `onnx/model_quantized.onnx` (92,361,116 bytes), `tokenizer.json`, `tokenizer_config.json`, `config.json` and eight `voices/*.bin` (522,240 bytes each), 96,542,690 bytes in all, from `onnx-community/Kokoro-82M-v1.0-ONNX` (Apache-2.0 on the card). Manifest entries have a flat OPFS `name` and a `path` under the base URL; `requiredRoles` replaces the Kitten role check. The Hugging Face commit is the single constant `KOKORO_Q8_COMMIT` in the manifest module (currently `1939ad2a8e41...`, to be pinned with the hosted copy).
- **Pipeline** (`chat/voice/voice-kokoro.mjs`, ported from `kokoro-js` 1.2.1, not imported): sentence splitting (its `TextSplitterStream` rules: abbreviations, numbers, URLs, quotes and brackets), then per sentence its text normalisation (quotes, honorifics, years, times, money, decimals), a split at punctuation, `phonemize(piece, "en-us")` for `a*` voices or `"en"` for British ones, kept punctuation, and its post-processing (`r`->`ɹ`, `x`->`k`, `ʲ`->`j`, `ɬ`->`l`, "hundred" spacing, "ninety"), then `tokenizer.json` (the Replace normaliser drops characters outside the vocabulary, one token per character, `[0, ...ids, 0]`, cut to 512), the style row `min(max(ids - 2, 0), 509)` of the voice `.bin`, and the run `{input_ids, style, speed}` -> 24 kHz Float32 `waveform` (nothing trimmed). One addition: a sentence over 300 characters is cut at clause marks and then spaces, because the reference silently truncates at 512 tokens.
- **Golden tests.** `tests/fixtures/kokoro-golden.json` (made by `node ops/voice/gen-kokoro-golden.mjs <node_modules> <tokenizer dir>`, which runs the unmodified reference with a recording wrapper around its phonemizer call) holds 25 phoneme strings with their reference token ids (exact equality, including truncation and unknown characters), 32 whole-sentence phonemize results replayed from the recorded phonemizer calls, and 11 reference sentence splits. `tests/fixtures/kokoro-tokenizer.json` is the model's `tokenizer.json`.
- **Bundles.** Two separate worker bundles keep the Kitten bundle unchanged; `build-worker.mjs` builds both with their own GPL banners and `.LEGAL.txt` files. They share the ONNX Runtime files. Removing an engine drops its own worker from the service worker cache, and the shared runtime files too unless the other engine's directory still exists.
- **Measured** (`tests/e2e/voice-kokoro.e2e.mjs`, headless Chromium on Centroid, 16 cores, cross-origin isolated, 4 threads, files served locally): install of 96.5 MB verified, load 1.2 s, "The capital of France is Paris. This is a short test of on device speech." is 5.0 s of audio in 1.9 s (real-time factor 2.4 to 2.7), first audio 0.8 to 1.1 s. A recogniser (faster-whisper tiny.en) reads it back word for word (word error rate 0.0). Earlier spike figures through `kokoro-js` and transformers.js were 0.56x to 0.86x (`docs/evidence/voice/kokoro-wasm-spike.json`); this is one machine, not a calibration, and a slower CPU will be slower.
- **Done elsewhere.** Hosting the files, pinning the commit and the voice picker are described in `docs/CDN-POPULATION.md` and `docs/VOICE-ENGINE-PLAN.md`.

## Licensing note

The bundle contains eSpeak NG (GPL-3.0-or-later), so the repository `LICENSE` is GPL-3.0. The full licence and source offer are served by the site itself at `/LICENSE` and `/THIRD-PARTY-NOTICES.md` (copied into `dist/` by `scripts/build.mjs`). Each `.LEGAL.txt` beside a worker is generated by `ops/voice/build-worker.mjs` and holds the linked comments from esbuild, the eSpeak NG GPL notice with its source URL, and the full licence texts of the bundled packages: ONNX Runtime Web (MIT; the npm package ships no licence file, so the text is the committed copy `ops/voice/licenses/onnxruntime-1.31.1-LICENSE.txt` of the upstream tag `v1.31.1`), fflate (MIT, Kitten worker only) and phonemizer (Apache-2.0), the last two read from the npm packages. Data and training-data licences are in `THIRD-PARTY-NOTICES.md`.

## Measured (headless Chromium on Centroid, 16 cores, no GPU)

Short two-sentence text, 7.9 s of audio: real-time factor 2.3 to 5.8 (varies by run), first audio 0.6 to 1.0 s, 4 threads. One machine, not a calibration.
