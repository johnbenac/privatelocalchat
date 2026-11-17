// WebLLM (MLC / TVM, WebGPU) adapter and the Cache API storage operations for the default tier (Qwen3.5-9B, q4f16_1 or q4f32_1).
// Provenance: productionised from spikes/llm/provider/adapters/webllm.js (FAB-02). Package @mlc-ai/web-llm 0.2.86 (Apache-2.0),
// vendored at ../vendor/webllm/web-llm-0.2.86.js (copy of spikes/llm/vendor/webllm/web-llm-0.2.86.js, sha256 ae2642e7...).
//
// What changed for production:
//   * the engine NEVER downloads. Downloading is the manager's visible, resumable, size-and-hash-verified install step
//     (storageOps.install) which writes the engine's own Cache API entries. load() first checks the cache against the catalogue and
//     refuses with a typed error (not-installed / cache-corrupt) instead of letting the engine trust a zero-length entry (F5) or
//     silently re-download or silently delete files.
//   * a failed download leaves NO entry (an entry is written only after the whole file arrived and passed its checks).
//   * token path uses a hand-written iterator, not `for await` (Safari 27.0 async-generator crash).
import { createThinkFilter } from "../think.mjs";
import { compareInventory, planInstall, createRateTracker, hex } from "../verify.mjs";
import {retryDownload} from '../download-retry.mjs';

const WEBLLM_URL = new URL("../vendor/webllm/web-llm-0.2.86.js", import.meta.url).href;
const SCOPES = ["webllm/model", "webllm/config", "webllm/wasm"];

// ---- storage operations (run inside the host Worker; Cache API is available there) -----------------------------------

async function bodyBytes(response) {
  if (!response.body) return 0;
  const reader = response.body.getReader(); let n = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) return n; n += value.byteLength; }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let next = 0; let failure = null;
  const worker = async () => { while (failure === null) { const i = next++; if (i >= items.length) return; try { results[i] = await fn(items[i], i); } catch (e) { failure = e; return; } } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure;
  return results;
}

/** Stored size of every catalogue file, by reading each body (the content-length header of a poisoned entry cannot be trusted). */
async function measure(files, { onProgress, signal } = {}) {
  const actual = new Map(); const caches_ = new Map(); let done = 0;
  await mapLimit(files, 4, async (f) => {
    if (signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    let cache = caches_.get(f.scope); if (!cache) { cache = await caches.open(f.scope); caches_.set(f.scope, cache); }
    const res = await cache.match(new Request(f.url));
    if (res) actual.set(f.path, await bodyBytes(res));
    onProgress?.({ phase: "inspect", filesDone: ++done, filesTotal: files.length });
  });
  return actual;
}

async function inspect({ files }, hooks = {}) {
  const t0 = performance.now();
  const actual = await measure(files, hooks);
  const inv = compareInventory(files, actual);
  return { ...inv, extra: [], ms: Math.round(performance.now() - t0), engine: "webllm", where: "Cache API: " + SCOPES.join(", ") };
}

async function sha256Of(blobOrBuffer) {
  const buf = blobOrBuffer instanceof Blob ? await blobOrBuffer.arrayBuffer() : blobOrBuffer;
  return hex(await crypto.subtle.digest("SHA-256", buf));
}

/** Size check of every file plus a SHA-256 of every file's bytes against the pinned LFS hashes (slow: reads all 5 GB again). */
async function verify({ files, deep = false }, hooks = {}) {
  const inv = await inspect({ files }, hooks);
  if (!deep) return { ...inv, deep: false, hashMismatch: [] };
  const hashMismatch = []; let done = 0;
  const caches_ = new Map();
  await mapLimit(files.filter((f) => !inv.bad.some((b) => b.path === f.path) && !inv.missing.includes(f.path)), 2, async (f) => {
    if (hooks.signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    let cache = caches_.get(f.scope); if (!cache) { cache = await caches.open(f.scope); caches_.set(f.scope, cache); }
    const res = await cache.match(new Request(f.url));
    const got = await sha256Of(await res.arrayBuffer());
    if (f.sha256 && got !== f.sha256) hashMismatch.push({ path: f.path, want: f.sha256, got, why: "sha256" });
    hooks.onProgress?.({ phase: "hash", filesDone: ++done, filesTotal: files.length });
  });
  const state = hashMismatch.length ? "corrupt" : inv.state;
  return { ...inv, state, ok: state === "complete", deep: true, hashMismatch, bad: [...inv.bad, ...hashMismatch] };
}

async function removeFiles({ files, paths = null }) {
  const wanted = paths ? files.filter((f) => paths.includes(f.path)) : files;
  let removed = 0;
  for (const f of wanted) { const cache = await caches.open(f.scope); if (await cache.delete(new Request(f.url))) removed++; }
  return { removed, requested: wanted.length };
}

async function downloadOne(f, { signal, onBytes, verifyHash }) {
  const res = await fetch(f.url, { signal, credentials: "omit", cache: "no-store" });
  if (!res.ok || !res.body) throw Object.assign(new Error(`HTTP ${res.status} for ${f.url}`), { name: "DownloadError", code: "download-failed" });
  const reader = res.body.getReader(); const chunks = []; let n = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.byteLength; onBytes(value.byteLength);
  }
  if (n !== f.bytes) throw Object.assign(new Error(`download size mismatch for ${f.path}: got ${n} bytes, the catalogue says ${f.bytes}`), { name: "DownloadError", code: "cache-corrupt" });
  const blob = new Blob(chunks, { type: res.headers.get("content-type") || "application/octet-stream" });
  if (verifyHash && f.sha256) {
    const got = await sha256Of(blob);
    if (got !== f.sha256) throw Object.assign(new Error(`checksum mismatch for ${f.path}: sha256 ${got}, the catalogue says ${f.sha256}`), { name: "DownloadError", code: "cache-corrupt" });
  }
  const cache = await caches.open(f.scope);
  await cache.put(new Request(f.url), new Response(blob, { status: 200, headers: { "content-length": String(n), "content-type": blob.type || "application/octet-stream", "x-cfp-sha256": f.sha256 || "" } }));
}

/**
 * Download what is missing or bad, resuming at file granularity: complete files are kept, everything else is fetched whole
 * (the Cache API cannot append, and the largest file is 311 MB). Bad entries are deleted FIRST and reported in `replaced`.
 * Progress objects carry cumulative bytes including the kept ones, so a resumed install starts above zero.
 */
async function install({ files, parallel = 3, verifyHash = true, deep = false }, { onProgress, signal } = {}) {
  // deep: also hash every stored file, so a same-size damaged file is found and replaced (repair uses this; a plain install does not need it)
  const inv = deep ? await verify({ files, deep: true }, { signal }) : await inspect({ files }, { signal });
  const plan = planInstall(files, inv);
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const rate = createRateTracker({ windowMs: 6000 });
  let fetched = 0; const active = new Set(); let filesDone = files.length - plan.todo.length;
  const report = (extra = {}) => {
    const t = performance.now(); rate.add(fetched, t);
    const bps = rate.bytesPerSecond();
    onProgress?.({ phase: "install", bytesDone: plan.bytesKept + fetched, bytesKept: plan.bytesKept, bytesTotal: total, filesDone, filesTotal: files.length, active: [...active], bytesPerSecond: bps, etaSeconds: rate.etaSeconds(plan.bytesToFetch - fetched), ...extra });
  };
  if (plan.deleteFirst.length) await removeFiles({ files, paths: plan.deleteFirst });
  report({ resumed: plan.bytesKept > 0 });
  let last = 0;
  await mapLimit(plan.todo, parallel, async (f) => {
    if (signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    active.add(f.path);
    await retryDownload(async()=>{
    let mine = 0;
    report();
    try {
      await downloadOne(f, { signal, verifyHash, onBytes: (b) => { mine += b; fetched += b; const t = performance.now(); if (t - last > 400) { last = t; report(); } } });
    } catch (e) { fetched -= mine; throw e; } // a failed file leaves nothing behind and is not counted
    },{signal,onRetry:extra=>{rate.reset();report(extra);}});
    active.delete(f.path); filesDone++; report();
  });
  const after = await inspect({ files }, { signal });
  if (!after.ok) throw Object.assign(new Error(`cache-incomplete after install: ${after.missing.length} missing, ${after.bad.length} bad`), { code: "cache-corrupt", detail: { missing: after.missing.slice(0, 20), bad: after.bad.slice(0, 20) } });
  return { ...after, fetchedBytes: fetched, keptBytes: plan.bytesKept, replaced: plan.deleteFirst, filesFetched: plan.todo.length };
}

export const storageOps = {
  inspect, verify, install,
  remove: removeFiles,
  async repair(args, hooks) { // find bad entries by size AND checksum, delete exactly those, fetch them again
    return install({ ...args, deep: true }, hooks);
  }
};

// ---- engine adapter --------------------------------------------------------------------------------------------------

export { preflight } from "./webgpu.mjs";

export class WebLlmAdapter {
  constructor() { this.engine = null; this.cfg = null; this.info = null; }

  async load(config, { onProgress }) {
    const cfg = this.cfg = config;
    if (!Array.isArray(cfg.files) || cfg.files.length === 0) throw Object.assign(new Error("webllm load config needs the catalogue file list (config.files)"), { name: "ConfigError" });
    // 1) the cache must hold exactly the catalogue, or we stop here with a precise error (no engine-side download, no silent repair)
    const tr = performance.now();
    const inv = await inspect({ files: cfg.files });
    const cacheCheckMs = Math.round(performance.now() - tr);
    if (!inv.ok) {
      const what = inv.state === "corrupt"
        ? `cache-corrupt: ${inv.bad.length} model file(s) in the browser cache do not match the catalogue (${inv.bad.slice(0, 4).map((b) => `${b.path} is ${b.got} bytes, expected ${b.want}`).join("; ")}${inv.bad.length > 4 ? "; ..." : ""})`
        : `not-installed: ${inv.missing.length} of ${inv.files} model files are not in the browser cache`;
      throw Object.assign(new Error(what), { name: "ModelCacheError", detail: { state: inv.state, missing: inv.missing.slice(0, 20), bad: inv.bad.slice(0, 20) } });
    }
    const webllm = this.webllm = await import(WEBLLM_URL);
    const modelRecord = {
      model: cfg.modelBase, model_id: cfg.modelId, model_lib: cfg.modelLib,
      overrides: { context_window_size: cfg.contextWindow ?? 4096 }
    };
    const appConfig = { model_list: [modelRecord], cacheBackend: "cache" };
    const timings = { cacheCheckMs };
    const t0 = performance.now(); let first = null; let lastText = "";
    this.engine = new webllm.MLCEngine({
      appConfig, logLevel: "WARN",
      initProgressCallback: (p) => {
        if (first === null) first = performance.now() - t0;
        lastText = String(p.text || "").slice(0, 160);
        onProgress?.({ phase: "engine", progress: p.progress, text: lastText });
      }
    });
    await this.engine.reload(cfg.modelId);
    timings.reloadMs = Math.round(performance.now() - t0);
    timings.firstProgressMs = first === null ? null : Math.round(first);
    this.info = {
      modelId: cfg.modelId, runtime: "web-llm/0.2.86", timings, context: { contextWindow: modelRecord.overrides.context_window_size },
      capabilities: {
        kind: "local-webgpu", structuredEnforced: ["json-schema"], structuredValidated: [], structuredEnforcement: { json_schema: "grammar", json_object: "grammar" },
        quantization: cfg.quantization || null, license: cfg.license || null, runtimeName: "web-llm", runtimeVersion: "0.2.86",
        contextWindowTokens: modelRecord.overrides.context_window_size, maxOutputTokens: 1024
      }
    };
    return this.info;
  }

  async run(req, signal, emit) {
    const s = req.sampling || {};
    const body = {
      messages: req.messages, stream: true, stream_options: { include_usage: true },
      temperature: s.temperature ?? 0, top_p: s.topP ?? 1, seed: s.seed ?? 1,
      extra_body: { enable_thinking: req.thinking === true }
    };
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens; // omitted: no limit before the context window
    if (s.repetitionPenalty) body.repetition_penalty = s.repetitionPenalty;
    if (req.stop?.length) body.stop = req.stop;
    // grammar-constrained: with a schema the engine cannot emit an id outside the schema's enum
    if (req.responseFormat?.type === "json_schema") body.response_format = { type: "json_object", schema: JSON.stringify(req.responseFormat.schema) };
    else if (req.responseFormat?.type === "json_object") body.response_format = { type: "json_object" };
    const onAbort = () => { try { this.engine.interruptGenerate(); } catch { /* engine may already be idle */ } };
    if (signal.aborted) return;
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const chunks = await this.engine.chat.completions.create(body);
      let usage = null; let finish = null;
      // Qwen3.5 thinks by default. With enable_thinking=false WebLLM starts the assistant text with an EMPTY think block; that block
      // (whitespace tolerant) is removed from the visible stream. A block with content is real reasoning and passes through untouched.
      const filter = req.thinking === true ? null : createThinkFilter();
      const out = (d) => { if (d) emit({ delta: d }); };
      const it = chunks[Symbol.asyncIterator]();
      for (;;) {
        const { value: chunk, done } = await it.next();
        if (done) break;
        const choice = chunk.choices?.[0];
        const d = choice?.delta?.content;
        if (d) out(filter ? filter.push(d) : d);
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk.usage) usage = chunk.usage;
      }
      if (filter) out(filter.flush());
      emit({
        usage: { promptTokens: usage?.prompt_tokens ?? null, completionTokens: usage?.completion_tokens ?? null, cachedPromptTokens: null, engineTimings: usage?.extra || null },
        finish: finish === "length" ? "length" : "stop"
      });
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  async stats() {
    let runtimeStats = null; try { runtimeStats = await this.engine.runtimeStatsText(); } catch (e) { runtimeStats = `unavailable: ${e?.message || e}`; }
    return { runtimeStatsText: runtimeStats, info: this.info };
  }

  async unload() {
    try { await this.engine?.unload(); } finally { this.engine = null; }
  }
}
