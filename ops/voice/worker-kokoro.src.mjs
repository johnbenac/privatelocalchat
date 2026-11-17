// The Kokoro voice worker, bundled by ops/voice/build-worker.mjs into chat/vendor/voice/worker-kokoro.js.
// Kokoro-82M q8 on ONNX Runtime Web (WASM, SIMD, threaded when the page is cross-origin isolated) with the phonemizer package (an espeak-ng
// build, GPL-3.0). The text is synthesised here, on the device; the worker never touches the network: the model files are read from the
// page's private storage (OPFS) directory the main thread installed them into. The pipeline is chat/voice/voice-kokoro.mjs.
//
// Protocol (requests carry an id; every reply carries the same id), the same as worker.src.mjs:
//   { op: "load", dir, files: { model, tokenizer, tokenizer_config }, voiceFiles: { voiceId: fileName }, threads? } -> { ok: true, voices: [...], loadMs }
//   { op: "speak", text, voice?, speed? }  -> zero or more { event: "chunk", samples: Float32Array (transferred), index, count, text }
//                                             then { ok: true, chunks, samples, synthMs, firstAudioMs }
//   { op: "cancel", target }               -> stops the speak with id `target` after the chunk in progress
//   { op: "unload" }                       -> { ok: true }
// A failure is { ok: false, error: { name, message } }.

import "./stream-polyfill.mjs"; // first: the phonemizer needs async iteration on streams, which Safari lacks
import * as ort from "onnxruntime-web/wasm";
import { phonemize } from "phonemizer";
import {
  SAMPLE_RATE, DEFAULT_VOICE, kokoroChunks, phonemizeText, createTokenizer, parseVoice, styleFor, resolveVoice,
} from "../../chat/voice/voice-kokoro.mjs";

let session = null;
let voices = null;
let tokenizer = null;
const cancelled = new Set();

async function readFile(dir, name) {
  const root = await navigator.storage.getDirectory();
  const folder = await root.getDirectoryHandle(dir);
  const handle = await folder.getFileHandle(name);
  return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}

async function load({ dir, files, voiceFiles, threads }) {
  const t0 = performance.now();
  if (session) return { voices: Object.keys(voices), loadMs: 0 };
  const base = new URL("./", self.location.href).href;
  ort.env.wasm.wasmPaths = { mjs: base + "ort-wasm-simd-threaded.mjs", wasm: base + "ort-wasm-simd-threaded.wasm" };
  ort.env.wasm.proxy = false;
  const cores = self.navigator?.hardwareConcurrency || 1;
  ort.env.wasm.numThreads = Number.isInteger(threads) ? threads : self.crossOriginIsolated ? Math.min(4, cores) : 1;
  const text = async (name) => JSON.parse(new TextDecoder().decode(await readFile(dir, name)));
  const [model, tokenizerJson, tokenizerConfig] = await Promise.all([readFile(dir, files.model), text(files.tokenizer), text(files.tokenizer_config)]);
  tokenizer = createTokenizer(tokenizerJson, tokenizerConfig);
  voices = {};
  for (const [id, name] of Object.entries(voiceFiles || {})) voices[id] = parseVoice(await readFile(dir, name));
  if (!Object.keys(voices).length) throw new Error("no Kokoro voice files were installed");
  session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  return { voices: Object.keys(voices), loadMs: Math.round(performance.now() - t0) };
}

async function synthesiseChunk(text, voiceId, speed) {
  const phonemes = await phonemizeText(text, voiceId, phonemize);
  const ids = tokenizer.encode(phonemes);
  if (ids.length <= 2) return new Float32Array(0); // nothing speakable (only marks the model does not know)
  const style = styleFor(voices[voiceId], ids.length);
  const out = await session.run({
    input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
    style: new ort.Tensor("float32", style, [1, style.length]),
    speed: new ort.Tensor("float32", Float32Array.of(speed), [1]),
  });
  return new Float32Array((out.waveform || Object.values(out)[0]).data); // a copy we own and can transfer
}

async function speak(id, { text, voice, speed }) {
  if (!session) throw new Error("the voice model is not loaded");
  const voiceId = resolveVoice(voice ?? DEFAULT_VOICE, Object.keys(voices));
  const finalSpeed = typeof speed === "number" && speed > 0 ? speed : 1;
  const chunks = kokoroChunks(text);
  const t0 = performance.now();
  let firstAudioMs = null, samples = 0, done = 0;
  for (let index = 0; index < chunks.length; index++) {
    if (cancelled.has(id)) break;
    const audio = await synthesiseChunk(chunks[index], voiceId, finalSpeed);
    if (cancelled.has(id)) break;
    if (!audio.length) continue;
    if (firstAudioMs === null) firstAudioMs = Math.round(performance.now() - t0);
    samples += audio.length; done++;
    self.postMessage({ id, event: "chunk", samples: audio, index, count: chunks.length, text: chunks[index] }, [audio.buffer]);
  }
  return { chunks: done, samples, synthMs: performance.now() - t0, firstAudioMs: firstAudioMs ?? 0, sampleRate: SAMPLE_RATE, cancelled: cancelled.has(id) };
}

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  const reply = (payload) => self.postMessage({ id, ...payload });
  if (op === "cancel") { cancelled.add(data.target); return; }
  try {
    if (op === "load") return reply({ ok: true, ...(await load(data)) });
    if (op === "speak") return reply({ ok: true, ...(await speak(id, data)) });
    if (op === "unload") {
      try { await session?.release(); } catch { /* already gone */ }
      session = null; voices = null; tokenizer = null;
      return reply({ ok: true });
    }
    throw new Error(`unknown voice worker op "${op}"`);
  } catch (error) {
    reply({ ok: false, error: { name: error?.name || "Error", message: String(error?.message || error) } });
  } finally {
    cancelled.delete(id);
  }
};
