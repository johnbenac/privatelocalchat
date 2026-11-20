// SPDX-License-Identifier: AGPL-3.0-only
// The "threads" variant of the standalone package (build.mjs --variant threads): the same worker and engine with two additions, made by exact text patches of the real sources so the
// default package stays byte-identical and nothing is copied. Every patch asserts that its target text is there once: if the sources change, the build stops instead of guessing.
//   * load takes `threads` (default 1). The worker uses min(threads, 4, hardwareConcurrency) threads only if the page is cross-origin isolated, otherwise 1; engine.status().threads says how many.
//   * speak takes `firstChunkSplit: { minChars }` (default off): the first chunk is cut at a comma (first-chunk.mjs).
function patch(src, from, to, name) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`variant patch "${name}": the text was found ${n} times, expected once`);
  return src.replace(from, () => to);
}
export function patchWorker(src) {
  let s = src;
  s = patch(s, 'import { phonemize } from "phonemizer";', 'import { phonemize } from "phonemizer";\nimport { splitFirst } from "./first-chunk.mjs";', "worker import");
  s = patch(s, "async function load({ model, tokenizer: tokenizerText, tokenizerConfig, voices: voiceBuffers }) {", "let usedThreads = 1;\nasync function load({ model, tokenizer: tokenizerText, tokenizerConfig, voices: voiceBuffers, threads = 1 }) {", "worker load signature");
  s = patch(s, "if (session) return { voices: Object.keys(voices), loadMs: 0 };", "if (session) return { voices: Object.keys(voices), loadMs: 0, threads: usedThreads };", "worker reload");
  s = patch(s, "ort.env.wasm.numThreads = 1; // single threaded on purpose: nothing here needs a cross-origin isolated page",
    "// threads only on a cross-origin isolated page that asked for them (SharedArrayBuffer is needed); otherwise one thread, as in the default package\n  const isolated = self.crossOriginIsolated === true && typeof SharedArrayBuffer === \"function\";\n  usedThreads = isolated && Number.isInteger(threads) && threads > 1 ? Math.max(1, Math.min(threads, 4, self.navigator?.hardwareConcurrency || 1)) : 1;\n  ort.env.wasm.numThreads = usedThreads;", "worker threads");
  s = patch(s, "return { voices: Object.keys(voices), loadMs: Math.round(performance.now() - t0) };", "return { voices: Object.keys(voices), loadMs: Math.round(performance.now() - t0), threads: usedThreads };", "worker load reply");
  s = patch(s, "async function speak(id, { text, voice, speed }) {", "async function speak(id, { text, voice, speed, firstChunkSplit }) {", "worker speak signature");
  s = patch(s, "const chunks = kokoroChunks(text);", "const chunks = splitFirst(kokoroChunks(text), firstChunkSplit);", "worker chunks");
  s = patch(s, "ONE thread, no SharedArrayBuffer, so the page needs no cross-origin isolation,", "ONE thread by default (threads variant: up to 4, only on a cross-origin isolated page that asks), no SharedArrayBuffer needed for the default,", "worker header");
  return s;
}
export function patchEngine(src) {
  let s = src;
  s = patch(s, "let config = null, worker = null, state = \"new\", voices = [], seq = 0, currentSpeak = null;", "let config = null, worker = null, state = \"new\", voices = [], seq = 0, currentSpeak = null, threadsUsed = 0;", "engine state");
  s = patch(s, "async function load({ signal, onProgress } = {}) {", "async function load({ signal, onProgress, threads = 1 } = {}) {", "engine load signature");
  s = patch(s, "voices: voiceBuffers }, transfer);\n      voices = reply.voices; state = \"ready\";", "voices: voiceBuffers, threads }, transfer);\n      voices = reply.voices; threadsUsed = reply.threads || 1; state = \"ready\";", "engine load message");
  s = patch(s, "return { ok: true, voices: [...voices], loadMs: Date.now() - t0, workerLoadMs: reply.loadMs, fromCache };", "return { ok: true, voices: [...voices], loadMs: Date.now() - t0, workerLoadMs: reply.loadMs, fromCache, threads: threadsUsed };", "engine load reply");
  s = patch(s, "async function speak(text, { voice, speed = 1, onChunk, signal } = {}) {", "async function speak(text, { voice, speed = 1, onChunk, signal, firstChunkSplit } = {}) {", "engine speak signature");
  s = patch(s, "{ op: \"speak\", text: String(text ?? \"\"), voice, speed }", "{ op: \"speak\", text: String(text ?? \"\"), voice, speed, firstChunkSplit }", "engine speak message");
  s = patch(s, "stopWorker(); voices = []; state = config ? \"initialised\" : \"new\";", "stopWorker(); voices = []; threadsUsed = 0; state = config ? \"initialised\" : \"new\";", "engine unload");
  s = patch(s, "const status = () => ({ state, voices: [...voices], totalBytes: config?.totalBytes ?? 0, cache: Boolean(store), sha256: sub ? \"subtle\" : \"js\" });", "const status = () => ({ state, voices: [...voices], totalBytes: config?.totalBytes ?? 0, cache: Boolean(store), sha256: sub ? \"subtle\" : \"js\", threads: threadsUsed });", "engine status");
  s = patch(s, "worker-kokoro-standalone.js)", "worker file of this package)", "engine message text");
  return s;
}
