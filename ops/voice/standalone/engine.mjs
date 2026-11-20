// SPDX-License-Identifier: AGPL-3.0-only
// kokoro-engine.mjs: the main-thread side of a standalone Kokoro-82M (q8) text-to-speech engine for a web page. No dependency, no page dependency, no window.APP_CONFIG.
// The page gives it a base address and a list of pinned files; it downloads them, REFUSES any file whose size or SHA-256 is not the pinned one before anything uses it, hands the
// verified bytes to a same-origin worker (worker-kokoro-standalone.js, single threaded, no cross-origin isolation needed) and returns speech as mono Float32 chunks at 24 kHz.
//
//   const engine = createKokoroEngine({ workerUrl: new URL("./worker-kokoro-standalone.js", import.meta.url).href });
//   engine.init({ base: "https://cdn.example/models/Kokoro/…/", files });      // checks the list; no network
//   await engine.load({ onProgress, signal });                                   // downloads (or reads the cache), verifies, loads the model
//   await engine.speak("Hello.", { voice: "af_heart", speed: 1, signal, onChunk: ({ samples, text, index, count, sampleRate, ipa }) => play(samples) });
//   engine.cancel();                                                              // stops a speak after the chunk in progress
//   await engine.unload();                                                        // frees the model and the worker
//
// Errors are KokoroEngineError with a stable `code`: bad-config, bad-file-list, network, http-error, bad-size, bad-hash, not-loaded, unknown-voice, worker-failed, aborted.
// Nothing is kept anywhere unless a file passed both checks. The cache (the Cache API when the page has it) holds verified files only and every cached file is checked again on use.

export const SAMPLE_RATE = 24000;
export const ROLES = Object.freeze(["model", "tokenizer", "tokenizer_config", "config", "voice"]);
const PATH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const HEX64 = /^[0-9a-f]{64}$/;
const CACHE_NAME = "kokoro-engine-v1";

export class KokoroEngineError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = "KokoroEngineError"; this.code = code; Object.assign(this, extra); }
}
const fail = (code, message, extra) => new KokoroEngineError(code, message, extra);
const abortError = () => fail("aborted", "the operation was cancelled");

// ---- SHA-256: the browser's own when the page may use it (secure contexts), else a plain JavaScript one (a page served over plain http on a LAN has no crypto.subtle) ----
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256Hex(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64), len = data.length;
  const total = ((len + 9 + 63) >> 6) << 6, tail = new Uint8Array(total - (len & ~63));   // the last block(s): the leftover bytes, 0x80, zeros, the bit length
  tail.set(data.subarray(len & ~63)); tail[len & 63] = 0x80;
  const bits = len * 8; new DataView(tail.buffer).setUint32(tail.length - 8, Math.floor(bits / 0x100000000)); new DataView(tail.buffer).setUint32(tail.length - 4, bits >>> 0);
  const block = (src, off) => {
    for (let i = 0; i < 16; i++) W[i] = (src[off + 4 * i] << 24) | (src[off + 4 * i + 1] << 16) | (src[off + 4 * i + 2] << 8) | src[off + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      W[i] = (W[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + W[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  };
  for (let off = 0; off + 64 <= (len & ~63); off += 64) block(data, off);
  for (let off = 0; off < tail.length; off += 64) block(tail, off);
  return [...H].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}
async function digestHex(bytes, subtle) {
  if (subtle) { const d = new Uint8Array(await subtle.digest("SHA-256", bytes)); return [...d].map((b) => b.toString(16).padStart(2, "0")).join(""); }
  return sha256Hex(bytes);
}

// ---- the list of pinned files ----
export function validateFiles(base, files) {
  let url;
  try { url = new URL(base); } catch { throw fail("bad-config", "base must be an absolute URL"); }
  if (!/^https?:$/.test(url.protocol) || !url.pathname.endsWith("/") || url.search || url.hash) throw fail("bad-config", "base must be an http(s) address ending with a slash, without a query or fragment");
  if (!Array.isArray(files) || !files.length) throw fail("bad-file-list", "the file list is empty");
  const seen = new Set(), voices = [], out = [];
  for (const f of files) {
    if (!f || typeof f !== "object") throw fail("bad-file-list", "a file entry is not an object");
    const { path, role, bytes, sha256 } = f;
    if (typeof path !== "string" || !PATH_RE.test(path) || path.split("/").some((p) => p === "." || p === "..")) throw fail("bad-file-list", `unsafe path: ${path}`);
    if (!ROLES.includes(role)) throw fail("bad-file-list", `unknown role for ${path}: ${role}`);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw fail("bad-file-list", `bad size for ${path}`);
    if (typeof sha256 !== "string" || !HEX64.test(sha256)) throw fail("bad-file-list", `bad SHA-256 for ${path}`);
    if (seen.has(path)) throw fail("bad-file-list", `the file list repeats ${path}`);
    seen.add(path); out.push({ path, role, bytes, sha256 });
    if (role === "voice") { const id = path.split("/").pop().replace(/\.bin$/, ""); if (voices.includes(id)) throw fail("bad-file-list", `two voice files named ${id}`); voices.push(id); }
  }
  for (const role of ROLES) if (!out.some((f) => f.role === role)) throw fail("bad-file-list", `the file list has no ${role} file`);
  return { base: url.href, files: out, voices, totalBytes: out.reduce((n, f) => n + f.bytes, 0) };
}

// ---- the cache: verified files only (the Cache API by default; anything with get(url) and put(url, bytes) and delete(url) can stand in) ----
function defaultCache(caches) {
  if (!caches?.open) return null;
  return {
    async get(url) { const c = await caches.open(CACHE_NAME); const r = await c.match(url); return r ? new Uint8Array(await r.arrayBuffer()) : null; },
    async put(url, bytes) { const c = await caches.open(CACHE_NAME); await c.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } })); },
    async delete(url) { const c = await caches.open(CACHE_NAME); await c.delete(url); }
  };
}

export function createKokoroEngine({ workerUrl, fetchImpl = globalThis.fetch?.bind(globalThis), WorkerImpl = globalThis.Worker, cache = "auto", subtle = "auto" } = {}) {
  if (typeof workerUrl !== "string" || !workerUrl) throw fail("bad-config", "workerUrl is required (a same-origin address of worker-kokoro-standalone.js)");
  const store = cache === "auto" ? defaultCache(globalThis.caches) : cache;
  const sub = subtle === "auto" ? globalThis.crypto?.subtle ?? null : subtle === "js" ? null : subtle;
  let config = null, worker = null, state = "new", voices = [], seq = 0, currentSpeak = null;
  const pending = new Map();

  const callWorker = (message, transfer = [], onEvent = null, onId = null) => new Promise((resolve, reject) => {
    if (!worker) { reject(fail("worker-failed", "the worker is not running")); return; }
    const id = ++seq; pending.set(id, { resolve, reject, onEvent }); onId?.(id);   // the id is known before the request leaves, so a cancel can name it
    try { worker.postMessage({ id, ...message }, transfer); } catch (error) { pending.delete(id); reject(fail("worker-failed", String(error?.message || error))); }
  });
  function startWorker() {
    worker = new WorkerImpl(workerUrl, { type: "module", name: "kokoro-engine" });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id); if (!p) return;
      if (data.event === "chunk") { try { p.onEvent?.(data); } catch { /* the caller's playback must not stop synthesis */ } return; }
      pending.delete(data.id);
      if (data.ok) p.resolve(data); else p.reject(fail("worker-failed", data.error?.message || "the worker failed", { workerError: data.error }));
    };
    worker.onerror = (event) => { const error = fail("worker-failed", event?.message || "the worker stopped"); for (const p of pending.values()) p.reject(error); pending.clear(); state = "failed"; };
  }
  function stopWorker() { try { worker?.terminate(); } catch { /* already gone */ } worker = null; for (const p of pending.values()) p.reject(abortError()); pending.clear(); }

  /** Check the address and the file list. No network, nothing stored. */
  function init({ base, files } = {}) {
    if (state === "loading") throw fail("bad-config", "init while loading");
    config = validateFiles(base, files); voices = []; state = "initialised";
    return { ok: true, voices: [...config.voices], totalBytes: config.totalBytes, files: config.files.length };
  }

  async function fetchVerified(file, { signal, onBytes }) {
    const url = config.base + file.path;
    if (store) {   // a cached copy is used only if it passes BOTH checks again
      try {
        const hit = await store.get(url);
        if (hit && hit.length === file.bytes && (await digestHex(hit, sub)) === file.sha256) { onBytes(file.bytes); return { bytes: hit, fromCache: true }; }
        if (hit) await store.delete(url).catch(() => {});
      } catch { /* a broken cache is a miss */ }
    }
    let response;
    try { response = await fetchImpl(url, { mode: "cors", credentials: "omit", cache: "no-store", signal }); }
    catch (error) { if (signal?.aborted) throw abortError(); throw fail("network", `could not fetch ${file.path}: ${error?.message || error}`, { path: file.path }); }
    if (!response.ok) throw fail("http-error", `${file.path}: HTTP ${response.status}`, { path: file.path, status: response.status });
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > 0 && !response.headers.get("content-encoding") && declared !== file.bytes) { try { await response.body?.cancel(); } catch { /* ignore */ } throw fail("bad-size", `${file.path}: the server says ${declared} bytes, the pin says ${file.bytes}`, { path: file.path }); }
    const out = new Uint8Array(file.bytes); let got = 0;   // never larger than the pinned size: a bigger body is refused at once
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (got + value.length > file.bytes) { try { await reader.cancel(); } catch { /* ignore */ } throw fail("bad-size", `${file.path}: more than the pinned ${file.bytes} bytes arrived`, { path: file.path }); }
        out.set(value, got); got += value.length; onBytes(value.length);
      }
    } catch (error) { if (error instanceof KokoroEngineError) throw error; if (signal?.aborted) throw abortError(); throw fail("network", `${file.path}: the download broke: ${error?.message || error}`, { path: file.path }); }
    if (got !== file.bytes) throw fail("bad-size", `${file.path}: ${got} bytes arrived, the pin says ${file.bytes}`, { path: file.path });
    if ((await digestHex(out, sub)) !== file.sha256) throw fail("bad-hash", `${file.path}: the SHA-256 is not the pinned one, the file was refused`, { path: file.path });
    if (store) { try { await store.put(url, out); } catch { /* not cached; still verified and usable */ } }
    return { bytes: out, fromCache: false };
  }

  /** Fetch every file (the three voice files and the model, all together as ONE install), verify each, then load the model in the worker. Nothing is used before it passed. */
  async function load({ signal, onProgress } = {}) {
    if (!config) throw fail("bad-config", "call init() first");
    if (state === "ready") return { ok: true, voices: [...voices], loadMs: 0, fromCache: [] };
    if (state === "loading") throw fail("bad-config", "load is already running");
    state = "loading"; const t0 = Date.now();
    try {
      const got = new Map(), fromCache = []; let done = 0;
      const total = config.totalBytes;
      for (const [index, file] of config.files.entries()) {
        if (signal?.aborted) throw abortError();
        const r = await fetchVerified(file, { signal, onBytes: (n) => { done += n; try { onProgress?.({ path: file.path, fileIndex: index, fileCount: config.files.length, bytesDone: done, bytesTotal: total }); } catch { /* ignore */ } } });
        got.set(file.path, r.bytes); if (r.fromCache) fromCache.push(file.path);
      }
      if (!worker) startWorker();
      const text = (role) => new TextDecoder().decode(got.get(config.files.find((f) => f.role === role).path));
      const modelFile = config.files.find((f) => f.role === "model"), model = got.get(modelFile.path).buffer;
      const voiceBuffers = {}; const transfer = [model];
      for (const f of config.files.filter((x) => x.role === "voice")) { const b = got.get(f.path).buffer; voiceBuffers[f.path.split("/").pop().replace(/\.bin$/, "")] = b; transfer.push(b); }
      const reply = await callWorker({ op: "load", model, tokenizer: text("tokenizer"), tokenizerConfig: text("tokenizer_config"), voices: voiceBuffers }, transfer);
      voices = reply.voices; state = "ready";
      return { ok: true, voices: [...voices], loadMs: Date.now() - t0, workerLoadMs: reply.loadMs, fromCache };
    } catch (error) { state = config ? "initialised" : "new"; if (state === "initialised" && worker) stopWorker(); throw error; }
  }

  /** Speak `text`; onChunk gets { samples: Float32Array (mono), text, index, count, sampleRate: 24000, ipa } once per chunk, in order. */
  async function speak(text, { voice, speed = 1, onChunk, signal } = {}) {
    if (state !== "ready") throw fail("not-loaded", "the engine is not loaded");
    if (voice !== undefined && !voices.includes(voice)) throw fail("unknown-voice", `voice ${voice} is not loaded (loaded: ${voices.join(", ")})`);
    if (signal?.aborted) throw abortError();
    let target = null;
    const onAbort = () => { if (target !== null) try { worker?.postMessage({ op: "cancel", target }); } catch { /* gone */ } };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const reply = await callWorker({ op: "speak", text: String(text ?? ""), voice, speed }, [], (data) => onChunk?.({ samples: data.samples, text: data.text, index: data.index, count: data.count, sampleRate: SAMPLE_RATE, ipa: data.ipa ?? null }), (id) => { target = id; currentSpeak = id; });
      return { chunks: reply.chunks, samples: reply.samples, audioSeconds: reply.samples / SAMPLE_RATE, synthMs: reply.synthMs, firstAudioMs: reply.firstAudioMs, sampleRate: SAMPLE_RATE, cancelled: Boolean(reply.cancelled) || Boolean(signal?.aborted) };
    } finally { signal?.removeEventListener("abort", onAbort); currentSpeak = null; }
  }
  /** Stop the speak in progress after the chunk being synthesised (chunks already delivered stay delivered). */
  function cancel() { if (currentSpeak !== null) try { worker?.postMessage({ op: "cancel", target: currentSpeak }); } catch { /* gone */ } }
  async function unload() {
    if (worker && state === "ready") { try { await callWorker({ op: "unload" }); } catch { /* the worker is going away anyway */ } }
    stopWorker(); voices = []; state = config ? "initialised" : "new";
    return { ok: true };
  }
  const status = () => ({ state, voices: [...voices], totalBytes: config?.totalBytes ?? 0, cache: Boolean(store), sha256: sub ? "subtle" : "js" });
  return { init, load, speak, cancel, unload, status };
}
