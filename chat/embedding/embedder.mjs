// The page's side of the small sentence-embedding model (MongoDB/mdbr-leaf-ir, 256 numbers per sentence, run in a same-origin worker by
// ONNX Runtime WASM). It turns what a person says into a vector so Roberta can match it to a topic by meaning (chat/roberta/intent-router.mjs).
// It generates nothing and sends nothing: the sentence is embedded on this device; only the model files are downloaded, once, and the
// browser's Cache API keeps them (the worker enables it), so a reload or an offline visit does not fetch them again.
//
//   const embedder = createEmbedder();
//   embedder.ready();                          // optional: start loading now (about 24 MB the first time); safe to call again
//   const vector = await embedder.embedQuery("is this sending information to the cloud");   // Float32Array(256), unit length
//
// States: idle (no worker; the first use starts it), loading, ready, failed (message in `error`; calling ready() tries again),
// unavailable (never started: data saver is on, or there is no Worker here; reason in `error`). After `idleMs` without use the worker is
// terminated to give its memory back (state returns to idle) and the next use restarts it from the cached files.

import { EMBEDDING_MODEL_BASE, EMBEDDING_WASM_BASE } from "./embedding-config.mjs";
import { EMBEDDING_MODEL } from "./embedding-model.mjs";

const DEFAULT_WORKER_URL = () => new URL("../vendor/embedding/worker.js", import.meta.url).href;
// a rejection nobody awaits (fire-and-forget ready()) must not be reported as unhandled
const refuse = (failure) => { const p = Promise.reject(failure); p.catch(() => {}); return p; };
const SAVE_DATA_REASON = "Data saver is on, so the small matching model (about 24 megabytes) is not downloaded.";

export function createEmbedder({
  workerUrl, modelBase = EMBEDDING_MODEL_BASE, wasmBase = EMBEDDING_WASM_BASE, idleMs = 120000,
  createWorker, saveData, force = false, timers = {},
} = {}) {
  const setTimer = timers.setTimeout || ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearTimer = timers.clearTimeout || ((id) => globalThis.clearTimeout(id));
  const makeWorker = createWorker || ((url) => {
    if (typeof Worker !== "function") throw new Error("this browser cannot start a web worker");
    return new Worker(url, { type: "module", name: "intent-embedding" });
  });
  const wantsSaveData = () => (typeof saveData === "boolean" ? saveData : Boolean(globalThis.navigator?.connection?.saveData));

  let state = "idle";
  let error = null;
  let worker = null;
  let starting = null; // the shared promise of the load in progress, or of the ready worker
  let seq = 0;
  let active = 0;
  let idleTimer = null;
  let lastInit = null;
  const waiting = new Map();
  const listeners = new Set();

  const set = (next, message = null) => {
    state = next; error = message;
    for (const fn of [...listeners]) { try { fn(state, { error }); } catch { /* a listener's failure is its own */ } }
  };
  const clearIdle = () => { if (idleTimer !== null) { clearTimer(idleTimer); idleTimer = null; } };

  function discard(reason, failure = null) {
    clearIdle();
    const previous = worker;
    worker = null; starting = null;
    try { previous?.terminate(); } catch { /* already gone */ }
    for (const pending of waiting.values()) pending.reject(failure || new Error(`the embedding worker stopped (${reason})`));
    waiting.clear();
  }
  function fail(instance, cause) {
    if (instance !== worker) return;
    const failure = cause instanceof Error ? cause : new Error(String(cause));
    discard("failed", failure);
    set("failed", failure.message);
  }
  function scheduleIdle() {
    clearIdle();
    if (state !== "ready" || active > 0 || waiting.size > 0 || !(idleMs > 0)) return;
    idleTimer = setTimer(() => {
      idleTimer = null;
      if (state === "ready" && active === 0 && waiting.size === 0) { discard("idle"); set("idle"); }
    }, idleMs);
    idleTimer?.unref?.();
  }
  function call(instance, message) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      waiting.set(id, { resolve, reject });
      try { instance.postMessage({ ...message, id }); } catch (cause) { waiting.delete(id); reject(cause); }
    });
  }

  function start() {
    if (starting) return starting;
    if (!force && wantsSaveData()) {
      set("unavailable", SAVE_DATA_REASON);
      return refuse(new Error(SAVE_DATA_REASON));
    }
    const url = workerUrl || DEFAULT_WORKER_URL();
    let instance;
    try { instance = makeWorker(url); } catch (cause) {
      const failure = new Error(`The matching model's worker could not be created at ${url}: ${cause?.message ?? cause}`);
      worker = null; set(typeof Worker === "function" || createWorker ? "failed" : "unavailable", failure.message);
      return refuse(failure);
    }
    worker = instance;
    set("loading");
    instance.onmessage = ({ data }) => {
      if (worker !== instance || !data) return;
      const pending = waiting.get(data.id);
      if (!pending) return;
      waiting.delete(data.id);
      if (data.ok) pending.resolve(data);
      else pending.reject(Object.assign(new Error(data.error || "the embedding worker reported an error"), { name: data.name || "Error", workerStack: data.stack }));
    };
    instance.onerror = (event) => {
      const detail = event?.message || event?.error?.message || "the browser gave no details (the worker script may be missing or blocked)";
      fail(instance, new Error(`The matching model's worker failed at ${url}: ${detail}`));
    };
    instance.onmessageerror = () => fail(instance, new Error(`The matching model's worker sent a reply that could not be read (${url})`));
    const t0 = Date.now();
    const promise = call(instance, { op: "init", config: { modelBase, wasmBase } }).then((result) => {
      if (worker !== instance) throw new Error("the embedding worker was stopped before it finished loading");
      lastInit = { ms: Date.now() - t0, model: result?.id_model, timings: result?.timings };
      set("ready");
      scheduleIdle();
      return undefined;
    }, (cause) => {
      const failure = new Error(`The matching model could not be loaded from ${modelBase}: ${cause?.message ?? cause}`);
      failure.cause = cause;
      fail(instance, failure);
      throw failure;
    });
    starting = promise;
    promise.catch(() => {}); // callers handle it; this keeps the shared promise from being reported twice
    return promise;
  }

  async function request(message, field) {
    active += 1; clearIdle();
    try {
      await start();
      const instance = worker;
      if (!instance) throw new Error("the embedding worker is not running");
      const reply = await call(instance, message);
      const value = reply[field];
      return value;
    } finally {
      active -= 1; scheduleIdle();
    }
  }
  const checked = (array) => {
    if (!Array.isArray(array) && !ArrayBuffer.isView(array)) throw new Error("the embedding worker returned no vector");
    if (array.length !== EMBEDDING_MODEL.dim) throw new Error(`the embedding has ${array.length} numbers, expected ${EMBEDDING_MODEL.dim}`);
    return Float32Array.from(array);
  };

  return {
    get state() { return state; },
    /** The message of the last failure, or why the model is unavailable; null otherwise. */
    get error() { return error; },
    /** How long the last load took (ms) and what the worker reported; null before the first load. */
    get lastInit() { return lastInit; },
    /** Starts loading on the first call; every caller shares one promise. After a failure, calling again tries again. */
    ready() { clearIdle(); const p = start(); p.then(scheduleIdle, scheduleIdle); return p; },
    async embedQuery(text) { return checked(await request({ op: "embedQuery", text: String(text ?? "") }, "vector")); },
    async embedDocuments(texts) {
      const vectors = await request({ op: "embedDocuments", texts: Array.from(texts, (t) => String(t ?? "")) }, "vectors");
      if (!Array.isArray(vectors)) throw new Error("the embedding worker returned no vectors");
      return vectors.map(checked);
    },
    /** Stops the worker now (memory back); the next use starts it again. */
    terminate() { if (worker || state === "loading" || state === "ready") { discard("stopped by the page"); set(state === "unavailable" ? "unavailable" : "idle"); } },
    /** Calls fn(state, { error }) on every change; returns a function that stops the calls. */
    onState(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
