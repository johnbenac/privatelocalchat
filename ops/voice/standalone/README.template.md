# kokoro-engine: a standalone Kokoro-82M text-to-speech engine for a web page

Built by the plc team from `ops/voice/standalone` in Private Local Chat (board T1013, requested by lipsync). Package licence: **AGPL-3.0-only** (`LICENSE`); the phonemizer inside the
worker is eSpeak NG, **GPL-3.0-or-later**, and the model is Apache-2.0 with a data notice: all notices are in `{{WORKER}}.LEGAL.txt` and `licences/`. Host the notice file next to the worker.

It speaks English with the voices in the page's file list ({{VOICES}}), on the device, in a worker, **single threaded and without cross-origin isolation**, using the **wasm-only entry of
onnxruntime-web {{ORT}}** (`onnxruntime-web/wasm`, execution provider `wasm`, no SharedArrayBuffer, no proxy worker). The page gives it a base address and a pinned file list; the engine
downloads each file, **refuses it unless its size and SHA-256 are the pinned ones, before anything uses it**, and only then loads the model.

## Status: what is and is not proven

* Proven (tests in the PLC repository: `tests/kokoro-standalone.test.mjs`, `tests/e2e/kokoro-standalone.e2e.mjs`): the file list is checked; a wrong size, a wrong hash, a truncated or an oversized
  or an HTTP-error download is refused and nothing is loaded or cached; real speech in headless Chromium on a page with NO cross-origin isolation, under
  `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' https://cdn.aiofourown.com`, with no policy violation; the audio is sample-for-sample the same as
  Private Local Chat's own engine.
* NOT proven: real-time speech on a phone (untested; on a loaded desktop host one thread is about real time); Safari, iOS and Firefox; pages served from other origins than the ones in the tests.

## Files in this folder (host these; the worker must be same-origin with the page)

{{SHIPPED}}

`source/` holds the corresponding source of the worker bundle and its build script. `PINS.json` and `SHA256SUMS` list every file above (except themselves) with size and SHA-256.

## Files the page downloads (once, as one install; nothing here is in the folder)

Base address: `{{BASE}}` (the shared programme CDN, which sends `Access-Control-Allow-Origin: *`). Pinned in `kokoro-files.json`:

{{DOWNLOADED}}

Total {{DOWNLOAD_TOTAL}} bytes ({{VOICES}} together, so changing the voice never reloads); the model alone is {{MODEL_ONLY}} bytes of that, so one voice more or less changes the total by only 522,240 bytes.
The page needs `connect-src` for that address only. The files are kept in the Cache API when the page has it (secure contexts); a page served over plain http has no Cache API and no
`crypto.subtle`: the engine then uses a built-in JavaScript SHA-256 and downloads again on every visit.

## Using it

```js
import { createKokoroEngine } from "./kokoro-engine.mjs";
const { base, files } = await (await fetch("./kokoro-files.json")).json();
const engine = createKokoroEngine({ workerUrl: new URL("./{{WORKER}}", import.meta.url).href });
engine.init({ base, files });                                   // checks the list; no network
await engine.load({ onProgress: ({ bytesDone, bytesTotal }) => {}, signal });   // fetch, verify, load: refuses a bad file with a KokoroEngineError
await engine.speak("Hello! This is a short sample.", { voice: "af_heart", speed: 1, signal,
  onChunk: ({ samples, text, index, count, sampleRate, ipa }) => { /* samples: mono Float32Array at 24000 Hz; ipa: the phoneme string of this chunk */ } });
engine.cancel();            // stops a speak after the chunk in progress
await engine.unload();      // frees the model and ends the worker
```

`speak` splits the text into sentences and calls `onChunk` once per chunk, in order (chunks that are silent are skipped). `ipa` is the phoneme string Kokoro was given for that chunk
(the model's own phoneme alphabet: IPA symbols with some letters of its own), not a timing track. Errors are `KokoroEngineError` with `code`: `bad-config`, `bad-file-list`, `network`,
`http-error`, `bad-size`, `bad-hash`, `not-loaded`, `unknown-voice`, `worker-failed`, `aborted`. `engine.status()` gives `{ state, voices, totalBytes, cache, sha256 }`.

## The worker's message protocol (if you drive the worker yourself)

Every request has an `id`; every reply carries the same `id`. The worker never fetches a model file and never touches storage.

| request | reply |
|---|---|
| `{ op: "load", model: ArrayBuffer, tokenizer: string, tokenizerConfig: string, voices: { voiceId: ArrayBuffer } }` | `{ ok: true, voices: [ids], loadMs }` |
| `{ op: "speak", text, voice?, speed? }` | zero or more `{ event: "chunk", samples: Float32Array (transferred), index, count, text, ipa }`, then `{ ok: true, chunks, samples, synthMs, firstAudioMs, sampleRate: 24000, cancelled }` |
| `{ op: "cancel", target }` (no reply) | stops the speak with id `target` after the chunk in progress |
| `{ op: "unload" }` | `{ ok: true }` |

A failure is `{ ok: false, error: { name, message } }`. The worker trusts the bytes it is given: the checks are the engine's, so drive the worker directly only with bytes you have checked.

## Not part of this package

Pocket TTS, Kitten, language models, lip-sync timing (it gives no per-phoneme times), and any Private Local Chat page code.
