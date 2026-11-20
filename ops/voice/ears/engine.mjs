// SPDX-License-Identifier: AGPL-3.0-only
import { sha256Hex } from "../standalone/engine.mjs";

export const MODEL_PATHS = Object.freeze([
  "config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json",
  "tokenizer_config.json", "added_tokens.json", "special_tokens_map.json", "normalizer.json",
  "merges.txt", "vocab.json", "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
]);
const runtimePin = typeof EARS_WASM_PIN === "undefined" ? null : EARS_WASM_PIN;
const CACHE_NAME = "ears-engine-v1";

export class EarsEngineError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "EarsEngineError";
    this.code = code;
    Object.assign(this, details);
  }
}
const fail = (code, message, details) => new EarsEngineError(code, message, details);
const aborted = () => fail("aborted", "The operation was cancelled");

export function validateFiles(base, files) {
  let url;
  try { url = new URL(base); }
  catch { throw fail("bad-config", "An absolute model base URL is required"); }
  if (!/^https?:$/.test(url.protocol) || !url.pathname.endsWith("/") ||
      url.search || url.hash || url.username || url.password) {
    throw fail("bad-config", "Use an HTTP(S) model base ending with a slash");
  }
  if (!Array.isArray(files) || files.length !== MODEL_PATHS.length) {
    throw fail("bad-file-list", "The complete Whisper tiny.en file list is required");
  }
  const remaining = new Set(MODEL_PATHS);
  const pins = Array.from(files, (file) => {
    const { path, bytes, sha256 } = file ?? {};
    if (!remaining.delete(path) || !Number.isSafeInteger(bytes) || bytes <= 0 ||
        bytes > 32 * 1024 * 1024 || typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
      throw fail("bad-file-list", "Invalid or duplicate Whisper file pin", { path });
    }
    return { path, bytes, sha256 };
  });
  return { base: url.href, files: pins, totalBytes: pins.reduce((sum, file) => sum + file.bytes, 0) };
}

function defaultCache(caches) {
  if (!caches?.open) return null;
  return {
    async get(url) {
      const response = await (await caches.open(CACHE_NAME)).match(url);
      return response ? new Uint8Array(await response.arrayBuffer()) : null;
    },
    async put(url, bytes) {
      await (await caches.open(CACHE_NAME)).put(url, new Response(bytes));
    },
  };
}

export function createEarsEngine({
  workerUrl, fetchImpl = globalThis.fetch?.bind(globalThis),
  cache = "auto", subtle = "auto", WorkerImpl = globalThis.Worker,
} = {}) {
  if (typeof workerUrl !== "string" || !workerUrl || typeof fetchImpl !== "function") {
    throw fail("bad-config", "A same-origin worker URL and fetch implementation are required");
  }
  const store = cache === "auto" ? defaultCache(globalThis.caches) : cache;
  const sub = subtle === "auto" ? globalThis.crypto?.subtle : subtle === "js" ? null : subtle;
  let config, worker, loading, active;
  let state = "new", threads = 0, sequence = 0;
  const pending = new Map();

  async function digest(bytes) {
    if (!sub) return sha256Hex(bytes);
    const hash = new Uint8Array(await sub.digest("SHA-256", bytes));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function verified(url, file, signal, onBytes = () => {}) {
    const checkAbort = () => { if (signal.aborted) throw aborted(); };
    checkAbort();
    let hit;
    try {
      const cached = await store?.get(url);
      if (cached?.length === file.bytes) hit = Uint8Array.from(cached);
    } catch { /* Cache API can be unavailable. */ }
    if (hit && await digest(hit) === file.sha256) {
      checkAbort();
      onBytes(file.bytes);
      return hit;
    }
    checkAbort();
    let response;
    try {
      response = await fetchImpl(url, {
        mode: "cors", credentials: "omit", cache: "no-store", redirect: "error", signal,
      });
    } catch (error) {
      checkAbort();
      throw fail("network", `Could not fetch ${file.path}: ${error.message}`, { path: file.path });
    }
    const details = { path: file.path };
    if (!response.ok) throw fail("http-error", `${file.path}: HTTP ${response.status}`, details);
    const declared = response.headers.get("content-length");
    if (declared !== null && !response.headers.get("content-encoding") && Number(declared) !== file.bytes) {
      response.body?.cancel().catch(() => {});
      throw fail("bad-size", `Unexpected Content-Length for ${file.path}`, details);
    }
    if (!response.body) throw fail("bad-size", `Empty response for ${file.path}`, details);
    const bytes = new Uint8Array(file.bytes);
    const reader = response.body.getReader();
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        checkAbort();
        if (done) break;
        if (received + value.length > bytes.length) {
          reader.cancel().catch(() => {});
          throw fail("bad-size", `Oversized response for ${file.path}`, details);
        }
        bytes.set(value, received);
        received += value.length;
        onBytes(value.length);
      }
    } catch (error) {
      checkAbort();
      if (error instanceof EarsEngineError) throw error;
      throw fail("network", `Download interrupted for ${file.path}: ${error.message}`, details);
    } finally {
      reader.releaseLock();
    }
    if (received !== file.bytes) throw fail("bad-size", `Truncated response for ${file.path}`, details);
    if (await digest(bytes) !== file.sha256) throw fail("bad-hash", `SHA-256 mismatch for ${file.path}`, details);
    checkAbort();
    try { await store?.put(url, bytes.slice()); } catch { /* Verified bytes remain usable. */ }
    return bytes;
  }

  function stopWorker(error) {
    worker?.terminate();
    worker = undefined;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  function startWorker() {
    const instance = new WorkerImpl(workerUrl, { type: "module", name: "ears-engine" });
    worker = instance;
    instance.onmessage = ({ data }) => {
      if (worker !== instance) return;
      const request = pending.get(data?.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.ok) request.resolve(data);
      else request.reject(fail("worker-failed", data.error || "The worker failed"));
    };
    instance.onerror = instance.onmessageerror = (event) => {
      if (worker !== instance) return;
      state = "failed";
      threads = 0;
      stopWorker(fail("worker-failed", event?.message || "The worker stopped"));
    };
  }

  function request(id, message, transfer) {
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { worker.postMessage({ id, ...message }, transfer); }
      catch (error) {
        pending.delete(id);
        reject(fail("worker-failed", error.message));
      }
    });
  }

  function init({ base, files } = {}) {
    const next = validateFiles(base, files);
    unload();
    config = next;
    state = "initialised";
    return { ok: true, totalBytes: next.totalBytes, files: next.files.length };
  }

  async function load({ signal, onProgress, threads: requestedThreads = 1 } = {}) {
    if (signal?.aborted) throw aborted();
    if (!config || loading || !Number.isSafeInteger(requestedThreads) || requestedThreads < 1) {
      throw fail("bad-config", "Initialise the engine and request a positive integer thread count");
    }
    if (state === "ready") return { ok: true, loadMs: 0, threads };
    const operation = new AbortController();
    const model = config;
    loading = operation;
    state = "loading";
    const cancelLoad = () => {
      operation.abort();
      if (loading === operation) stopWorker(aborted());
    };
    signal?.addEventListener("abort", cancelLoad, { once: true });
    const start = performance.now();
    try {
      let bytesDone = 0;
      const files = {};
      for (const file of model.files) {
        files[file.path] = (await verified(model.base + file.path, file, operation.signal, (n) => {
          bytesDone += n;
          try { onProgress?.({ bytesDone, bytesTotal: model.totalBytes }); } catch { /* Observer only. */ }
        })).buffer;
      }
      const wasm = runtimePin ? (await verified(
        new URL(runtimePin.path, new URL(workerUrl, globalThis.document?.baseURI ?? import.meta.url)).href,
        runtimePin, operation.signal,
      )).buffer : undefined;
      if (operation.signal.aborted) throw aborted();
      startWorker();
      const transfer = Object.values(files);
      if (wasm) transfer.push(wasm);
      const reply = await request(++sequence, { op: "load", files, wasm }, transfer);
      if (operation.signal.aborted) throw aborted();
      state = "ready";
      threads = reply.threads;
      return { ok: true, loadMs: performance.now() - start, threads };
    } catch (error) {
      if (operation.signal.aborted) throw aborted();
      if (loading === operation) {
        if (state !== "failed") state = "initialised";
        stopWorker(error);
      }
      throw error instanceof EarsEngineError ? error : fail("worker-failed", error.message);
    } finally {
      signal?.removeEventListener("abort", cancelLoad);
      if (loading === operation) {
        loading = undefined;
        if (state === "loading") state = "initialised";
      }
    }
  }

  function cancelRequest(id) {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.reject(aborted());
    try { worker.postMessage({ op: "cancel", target: id }); } catch { /* Worker already stopped. */ }
  }

  async function transcribe(audio, { signal } = {}) {
    if (state !== "ready") throw fail("not-loaded", "The speech engine is not loaded");
    if (signal?.aborted) throw aborted();
    if (!(audio instanceof Float32Array) || audio.length < 4800 || audio.length > 480000 ||
        !audio.every(Number.isFinite)) {
      throw fail("bad-config", "Expected 0.3 to 30 seconds of finite 16 kHz mono Float32 audio");
    }
    if (active !== undefined) throw fail("bad-config", "A transcription is already running");
    const id = ++sequence;
    const onAbort = () => cancelRequest(id);
    signal?.addEventListener("abort", onAbort, { once: true });
    active = id;
    try {
      const samples = audio.slice();
      const reply = await request(id, { op: "transcribe", samples }, [samples.buffer]);
      if (signal?.aborted) throw aborted();
      return { text: reply.text.trim(), ms: reply.ms };
    } finally {
      signal?.removeEventListener("abort", onAbort);
      if (active === id) active = undefined;
    }
  }

  function cancel() { cancelRequest(active); }

  function unload() {
    loading?.abort();
    loading = undefined;
    active = undefined;
    stopWorker(aborted());
    threads = 0;
    state = config ? "initialised" : "new";
    return { ok: true };
  }

  function status() { return { state, totalBytes: config?.totalBytes ?? 0, threads }; }
  return { init, load, transcribe, cancel, unload, status };
}
