// The page's side of the on-device text-to-speech engine (Kitten TTS nano 0.8 int8, or Kokoro-82M q8 with `engine: "kokoro"`, each in a
// same-origin worker on ONNX Runtime Web WASM).
// Nothing in the app calls this yet. It downloads the three model files once, verifies each against a pinned manifest, keeps them in the
// origin's private storage (OPFS) under their own directory, and synthesises speech on the device. The text never leaves the page.
//
//   const engine = createVoiceEngine({ baseUrl: KITTEN_NANO_BASE_URL });
//   await engine.install(({ overallLoaded, overallTotal }) => ...);      // resumable per file by retry; verified by SHA-256
//   const stats = await engine.speak("Hello there.", { onChunk: ({ samples, sampleRate }) => play(samples), signal });
//   // stats: { audioSeconds, synthSeconds, realTimeFactor, firstAudioMs }
//   await engine.remove();                                                // deletes the directory
//
// Limits: English only; digits and abbreviations are not expanded; OPFS writing uses createWritable() (Chrome, Edge, Firefox, Safari 26+).

import { sha256 } from "../../runtime/providers/vendor/noble-hashes/2.4.0/sha2.js";
import { writeOpfsStream } from "../../runtime/providers/opfs-stream-writer.mjs";
import { retryDownload } from "../../runtime/providers/download-retry.mjs";
import { KITTEN_NANO_MANIFEST } from "./voice-manifest.mjs";
import { KOKORO_Q8_MANIFEST } from "./voice-manifest-kokoro.mjs";
import { SAMPLE_RATE } from "./voice-kitten.mjs"; // 24 kHz for both engines

export const VOICE_DIR = "plc-voice-kitten-nano-0.8";
export const KOKORO_VOICE_DIR = "plc-voice-kokoro-q8";
// Per engine: its manifest, its OPFS directory and its worker bundle (both bundles sit in chat/vendor/voice/ and share the ONNX Runtime files).
const ENGINES = Object.freeze({
  kitten: Object.freeze({ manifest: KITTEN_NANO_MANIFEST, dirName: VOICE_DIR, worker: "worker.js" }),
  kokoro: Object.freeze({ manifest: KOKORO_Q8_MANIFEST, dirName: KOKORO_VOICE_DIR, worker: "worker-kokoro.js" }),
});
const MARKER = "installed.json";
const SAMPLE_SENTENCE = "Hello, this is a sample of the voice that runs on your device.";
const workerUrlFor = (name) => new URL(`../vendor/voice/${name}`, import.meta.url).href;
const SAFE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const failure = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const abortError = () => new DOMException("Speech cancelled", "AbortError");
const isMissing = (e) => e?.name === "NotFoundError";

/** Checks a manifest object (used for the one passed in): ids, names, sizes and 64-hex SHA-256 values. Throws on the first problem. */
export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.files) || !manifest.files.length) throw failure("bad-manifest", "the voice manifest lists no files");
  const roles = new Set();
  for (const f of manifest.files) {
    if (!f || typeof f.name !== "string" || !/^[A-Za-z0-9._-]+$/.test(f.name) || f.name === MARKER) throw failure("bad-manifest", `bad file name in the voice manifest: ${f?.name}`);
    if (!Number.isSafeInteger(f.bytes) || f.bytes <= 0) throw failure("bad-manifest", `bad size for ${f.name}`);
    if (!/^[0-9a-f]{64}$/.test(f.sha256 || "")) throw failure("bad-manifest", `bad SHA-256 for ${f.name}`);
    if (f.path !== undefined && (typeof f.path !== "string" || !SAFE_PATH.test(f.path) || f.path.split("/").includes(".."))) throw failure("bad-manifest", `bad path for ${f.name}`);
    roles.add(f.role);
  }
  if (new Set(manifest.files.map((f) => f.name)).size !== manifest.files.length) throw failure("bad-manifest", "the voice manifest repeats a file name");
  for (const role of manifest.requiredRoles || ["model", "voices", "config"]) if (!roles.has(role)) throw failure("bad-manifest", `the voice manifest has no ${role} file`);
  return manifest;
}

export function createVoiceEngine({
  engine = "kitten", cachesImpl, baseUrl, manifest, fetchImpl, workerUrl, dirName, getRoot, createWorker, threads, attempts = 4, pause, writeStream, connectTimeoutMs = 30000, stallMs = 60000,
} = {}) {
  const kind = ENGINES[engine];
  if (!kind) throw failure("bad-engine", `unknown voice engine "${engine}"`);
  manifest = manifest || kind.manifest;
  dirName = dirName || kind.dirName;
  const fetchFn = fetchImpl || ((...args) => globalThis.fetch(...args));
  const root = getRoot || (() => globalThis.navigator.storage.getDirectory());
  const makeWorker = createWorker || ((url) => {
    if (typeof Worker !== "function") throw new Error("this browser cannot start a web worker");
    return new Worker(url, { type: "module", name: "voice-engine" });
  });
  const base = baseUrl ? (baseUrl.endsWith("/") ? baseUrl : baseUrl + "/") : null;
  const totalBytes = () => manifest.files.reduce((n, f) => n + f.bytes, 0);
  const write = writeStream || ((key, stream) => writeOpfsStream(key, stream, { directory: dirName, readTimeoutMs: stallMs }));

  let worker = null, loading = null, loaded = false, installing = null, seq = 0, queue = Promise.resolve();
  const pending = new Map();

  const directory = async (create) => {
    try { return await (await root()).getDirectoryHandle(dirName, { create }); } catch (e) { if (!create && isMissing(e)) return null; throw e; }
  };
  const readMarker = async (dir) => {
    try { return JSON.parse(await (await (await dir.getFileHandle(MARKER)).getFile()).text()); } catch { return null; }
  };

  async function status() {
    const dir = await directory(false);
    let installed = false, bytes = 0;
    if (dir) {
      const marker = await readMarker(dir);
      if (marker?.id === manifest.id) {
        installed = true;
        for (const f of manifest.files) {
          try { const size = (await (await dir.getFileHandle(f.name)).getFile()).size; bytes += size; if (size !== f.bytes) installed = false; } catch { installed = false; }
        }
      }
    }
    return { id: manifest.id, installed, bytes: installed ? bytes : 0, totalBytes: totalBytes(), loaded, loading: Boolean(loading && !loaded), installing: Boolean(installing) };
  }

  async function removeDirectory() {
    try { await (await root()).removeEntry(dirName, { recursive: true }); } catch (e) { if (!isMissing(e)) throw e; }
  }

  // One request, with a time limit on the connection (a request that never answers used to wait at 0% for ever) and the same sync-access-handle writer the
  // model downloads use: it works in every Safari, unlike FileSystemFileHandle.createWritable().
  async function fetchWithTimeout(url, signal) {
    const ac = new AbortController(); let timedOut = false;
    const onAbort = () => ac.abort(signal.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; ac.abort(); }, connectTimeoutMs);
    try { return await fetchFn(url, { signal: ac.signal }); }
    catch (error) { if (timedOut) throw Object.assign(new Error(`No answer from the download server after ${Math.round(connectTimeoutMs / 1000)} s (connection timed out)`), { name: "TimeoutError", code: "connect-timeout" }); throw error; }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
  }

  async function downloadOne(file, { signal, onBytes, onPhase }) {
    return retryDownload(async () => {
      signal?.throwIfAborted();
      onPhase?.({ file: file.name, phase: "connecting" });
      const response = await fetchWithTimeout(base + (file.path || file.name), signal);
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} for ${file.name}`), { status: response.status });
      const hash = sha256.create();
      let size = 0;
      const counter = new TransformStream({ transform(chunk, controller) { hash.update(chunk); size += chunk.byteLength; onBytes(chunk.byteLength, size); controller.enqueue(chunk); } });
      const body = (response.body || new Blob([await response.arrayBuffer()]).stream()).pipeThrough(counter);
      try { await write(file.name, body); } // truncates the file first: a retry starts it over
      catch (error) {
        if (error?.code === "download-read-timeout") throw Object.assign(new Error(`The download stalled: no data for ${Math.round(stallMs / 1000)} s (connection timed out)`), { code: "download-stalled" });
        throw error;
      }
      const digest = hex(hash.digest());
      if (size !== file.bytes || digest !== file.sha256) {
        throw failure("hash-mismatch", `${file.name} does not match its pinned checksum (got ${size} bytes, SHA-256 ${digest.slice(0, 12)})`, { file: file.name });
      }
    }, { signal, attempts, pause, onRetry: (info) => onPhase?.({ file: file.name, ...info, phase: "retry" }) });
  }

  function install(onProgress, { signal } = {}) {
    if (installing) return installing;
    if (!base) return Promise.reject(failure("no-base-url", "createVoiceEngine needs a baseUrl to install from"));
    installing = (async () => {
      validateManifest(manifest);
      const before = await status();
      if (before.installed) return before;
      await removeDirectory(); // never build on a half-written set
      let done = 0;
      try {
        for (const file of manifest.files) {
          await downloadOne(file, {
            signal,
            onPhase: (info) => onProgress?.({ ...info, overallLoaded: done, overallTotal: totalBytes() }),
            onBytes: (delta, size) => onProgress?.({ file: file.name, loaded: size, total: file.bytes, overallLoaded: done + size, overallTotal: totalBytes() }),
          });
          done += file.bytes;
        }
        await write(MARKER, new Blob([JSON.stringify({ id: manifest.id, installedAt: Date.now(), files: manifest.files.map(({ name, bytes, sha256: s }) => ({ name, bytes, sha256: s })) })]).stream());
      } catch (error) {
        await removeDirectory().catch(() => {});
        throw error;
      }
      return { ...(await status()), installing: false };
    })().finally(() => { installing = null; });
    return installing;
  }

  const discardWorker = (reason) => {
    const previous = worker;
    worker = null; loading = null; loaded = false;
    try { previous?.terminate(); } catch { /* gone */ }
    for (const p of pending.values()) p.reject(reason instanceof Error ? reason : new Error(`the voice worker stopped (${reason})`));
    pending.clear();
  };

  function call(message, handlers = {}, transfer) {
    return new Promise((resolve, reject) => {
      if (!worker) { reject(new Error("the voice worker is not running")); return; }
      const id = ++seq;
      pending.set(id, { ...handlers, resolve, reject });
      try { worker.postMessage({ id, ...message }, transfer); } catch (error) { pending.delete(id); reject(error); }
    });
  }

  function wire(instance) {
    instance.onmessage = ({ data }) => {
      if (instance !== worker || !data) return;
      const p = pending.get(data.id);
      if (!p) return;
      if (data.event === "chunk") { try { p.onChunk?.({ samples: data.samples, sampleRate: SAMPLE_RATE, index: data.index, count: data.count, text: data.text }); } catch { /* the caller's playback error is theirs */ } return; }
      pending.delete(data.id);
      if (data.ok) p.resolve(data); else p.reject(Object.assign(new Error(data.error?.message || "voice worker failed"), { name: data.error?.name || "Error" }));
    };
    instance.onerror = (event) => { if (instance === worker) discardWorker(new Error(event?.message || "the voice worker failed")); };
    instance.onmessageerror = () => { if (instance === worker) discardWorker("its message could not be read"); };
  }

  function load() {
    if (loading) return loading;
    loading = (async () => {
      const current = await status();
      if (!current.installed) throw failure("not-installed", "the voice is not installed");
      const files = Object.fromEntries(manifest.files.filter((f) => f.role !== "voice").map((f) => [f.role, f.name]));
      // several voice files (Kokoro): { voiceId: fileName }, the id being the file name without ".bin"
      const voiceFiles = Object.fromEntries(manifest.files.filter((f) => f.role === "voice").map((f) => [f.name.replace(/\.bin$/, ""), f.name]));
      const start = (n) => { worker = makeWorker(workerUrl || workerUrlFor(kind.worker)); wire(worker); return call({ op: "load", dir: dirName, files, ...(Object.keys(voiceFiles).length ? { voiceFiles } : {}), threads: n }); };
      let reply;
      try { reply = await start(threads); }
      catch (error) {
        // The threaded runtime reserves a large block of shared memory; on a phone short of memory that fails ("no available backend ... out of memory"). The runtime
        // cannot be started again in the same worker, so a fresh worker tries once with a single thread, which needs far less.
        if (threads === 1 || !/out of memory|no available backend|RangeError/i.test(String(error?.message || error))) throw error;
        discardWorker("retrying with one thread");
        reply = await start(1);
      }
      loaded = true;
      return { voices: reply.voices, loadMs: reply.loadMs };
    })().catch((error) => { discardWorker(error); throw error; });
    return loading;
  }

  async function unload() {
    if (worker && loaded) { try { await call({ op: "unload" }); } catch { /* terminated below anyway */ } }
    discardWorker("unloaded");
  }

  /**
   * The service worker keeps the voice workers and the 13 MB ONNX Runtime files in the app cache the first time they are used (they are not
   * precached, so nobody who never uses the voice pays for them). Removing a voice removes its own worker file; the shared runtime files go too,
   * unless the other engine is still installed and needs them.
   */
  async function purgeRuntimeCache() {
    const store = cachesImpl || globalThis.caches;
    if (!store?.keys) return 0;
    let otherInstalled = false;
    try {
      for (const [other, info] of Object.entries(ENGINES)) {
        if (other === engine || info.dirName === dirName) continue;
        try { await (await root()).getDirectoryHandle(info.dirName); otherInstalled = true; } catch { /* not there */ }
      }
    } catch { /* storage not readable: treat as not installed */ }
    const workers = new Set(Object.values(ENGINES).map((e) => e.worker));
    let removed = 0;
    try {
      for (const name of await store.keys()) {
        const cache = await store.open(name);
        for (const request of await cache.keys()) {
          const file = /\/vendor\/voice\/([^/]+)$/.exec(new URL(request.url).pathname)?.[1];
          if (!file) continue;
          const mine = file === kind.worker || file === kind.worker + ".LEGAL.txt";
          const shared = !workers.has(file) && !/^worker.*\.js(\.LEGAL\.txt)?$/.test(file);
          if ((mine || (shared && !otherInstalled)) && await cache.delete(request)) removed++;
        }
      }
    } catch { /* a cache that cannot be cleaned is not fatal; the model files are already gone */ }
    return removed;
  }

  async function remove() {
    await unload();
    await removeDirectory();
    await purgeRuntimeCache();
    return status();
  }

  function speak(text, { onChunk, signal, speed, voice } = {}) {
    const run = async () => {
      signal?.throwIfAborted();
      await load();
      signal?.throwIfAborted();
      const started = performance.now();
      let target = null;
      const onAbort = () => { if (target !== null) try { worker?.postMessage({ op: "cancel", target }); } catch { /* worker gone */ } };
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const reply = await new Promise((resolve, reject) => {
          if (!worker) { reject(new Error("the voice worker is not running")); return; }
          const id = ++seq; target = id;
          pending.set(id, { onChunk, resolve, reject });
          if (signal?.aborted) { pending.delete(id); reject(abortError()); return; }
          worker.postMessage({ id, op: "speak", text: String(text ?? ""), speed, voice });
        });
        if (signal?.aborted) throw abortError();
        const audioSeconds = reply.samples / SAMPLE_RATE;
        const synthSeconds = reply.synthMs / 1000;
        return {
          audioSeconds, synthSeconds, realTimeFactor: synthSeconds > 0 ? audioSeconds / synthSeconds : 0, firstAudioMs: reply.firstAudioMs,
          chunks: reply.chunks, wallSeconds: (performance.now() - started) / 1000,
        };
      } finally { signal?.removeEventListener("abort", onAbort); }
    };
    // one synthesis at a time: the worker has one session
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }

  async function sample(options = {}) {
    const parts = [];
    const stats = await speak(SAMPLE_SENTENCE, { ...options, onChunk: (c) => { parts.push(c.samples); options.onChunk?.(c); } });
    const audio = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { audio.set(p, at); at += p.length; }
    return { ...stats, audio, sampleRate: SAMPLE_RATE };
  }

  /** Stops a worker that no longer answers without waiting for it: every waiting call is rejected and the next speak starts a fresh worker. */
  const terminate = () => discardWorker(new Error("the voice worker was stopped because it stopped responding"));

  return { status, install, remove, load, unload, terminate, speak, sample, get manifest() { return manifest; } };
}
