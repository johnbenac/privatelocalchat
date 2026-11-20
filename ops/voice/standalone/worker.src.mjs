// SPDX-License-Identifier: AGPL-3.0-only
// The standalone Kokoro worker, bundled by ops/voice/standalone/build.mjs into worker-kokoro-standalone.js.
// Kokoro-82M q8 on ONNX Runtime Web 1.31.1, the WASM-only entry (`onnxruntime-web/wasm`), ONE thread, no SharedArrayBuffer, so the page needs no cross-origin isolation, with the
// phonemizer package (an eSpeak NG build, GPL-3.0-or-later). The text is synthesised here, on the device. The worker never fetches a model file and never touches storage:
// the main thread (kokoro-engine.mjs) has already checked every file against its pinned size and SHA-256 and hands the bytes over in the `load` message.
//
// Protocol (every request carries an id; every reply carries the same id):
//   { op: "load", model: ArrayBuffer, tokenizer: string, tokenizerConfig: string, voices: { voiceId: ArrayBuffer } }  -> { ok: true, voices: [ids], loadMs }
//   { op: "speak", text, voice?, speed? }  -> zero or more { event: "chunk", samples: Float32Array (transferred), index, count, text, ipa }, then
//                                            { ok: true, chunks, samples, synthMs, firstAudioMs, sampleRate: 24000, cancelled }
//   { op: "cancel", target }               -> stops the speak with id `target` after the chunk in progress
//   { op: "unload" }                       -> { ok: true }
// A failure is { ok: false, error: { name, message } }.

import "../stream-polyfill.mjs"; // first: the phonemizer needs async iteration on streams, which Safari lacks
import * as ort from "onnxruntime-web/wasm";
import { phonemize } from "phonemizer";
import {
  SAMPLE_RATE, DEFAULT_VOICE, kokoroChunks, phonemizeText, createTokenizer, parseVoice, styleFor, resolveVoice,
} from "../../../chat/voice/voice-kokoro.mjs";

let session = null;
let voices = null;
let tokenizer = null;
const cancelled = new Set();

async function load({ model, tokenizer: tokenizerText, tokenizerConfig, voices: voiceBuffers }) {
  const t0 = performance.now();
  if (session) return { voices: Object.keys(voices), loadMs: 0 };
  const base = new URL("./", self.location.href).href;
  ort.env.wasm.wasmPaths = { mjs: base + "ort-wasm-simd-threaded.mjs", wasm: base + "ort-wasm-simd-threaded.wasm" };
  ort.env.wasm.proxy = false;
  ort.env.wasm.numThreads = 1; // single threaded on purpose: nothing here needs a cross-origin isolated page
  tokenizer = createTokenizer(JSON.parse(tokenizerText), JSON.parse(tokenizerConfig));
  voices = {};
  for (const [id, buffer] of Object.entries(voiceBuffers || {})) voices[id] = parseVoice(new Uint8Array(buffer));
  if (!Object.keys(voices).length) throw new Error("no Kokoro voice was given");
  session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ["wasm"] });
  return { voices: Object.keys(voices), loadMs: Math.round(performance.now() - t0) };
}

async function synthesiseChunk(text, voiceId, speed) {
  const phonemes = await phonemizeText(text, voiceId, phonemize);
  const ids = tokenizer.encode(phonemes);
  if (ids.length <= 2) return { audio: new Float32Array(0), phonemes }; // nothing speakable (only marks the model does not know)
  const style = styleFor(voices[voiceId], ids.length);
  const out = await session.run({
    input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
    style: new ort.Tensor("float32", style, [1, style.length]),
    speed: new ort.Tensor("float32", Float32Array.of(speed), [1]),
  });
  return { audio: new Float32Array((out.waveform || Object.values(out)[0]).data), phonemes }; // a copy we own and can transfer
}

async function speak(id, { text, voice, speed }) {
  if (!session) throw new Error("the voice model is not loaded");
  const voiceId = resolveVoice(voice ?? DEFAULT_VOICE, Object.keys(voices));
  const finalSpeed = typeof speed === "number" && speed > 0 ? speed : 1;
  const chunks = kokoroChunks(text);
  const t0 = performance.now();
  let firstAudioMs = null, samples = 0, done = 0;
  for (let index = 0; index < chunks.length; index++) {
    // Yield to the message queue before every chunk: synthesis never gives the worker's event loop a turn on its own, so without this a `cancel` request would sit unread until the whole text was spoken.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (cancelled.has(id)) break;
    const { audio, phonemes } = await synthesiseChunk(chunks[index], voiceId, finalSpeed);
    if (cancelled.has(id)) break;
    if (!audio.length) continue;
    if (firstAudioMs === null) firstAudioMs = Math.round(performance.now() - t0);
    samples += audio.length; done++;
    self.postMessage({ id, event: "chunk", samples: audio, index, count: chunks.length, text: chunks[index], ipa: phonemes }, [audio.buffer]);
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
