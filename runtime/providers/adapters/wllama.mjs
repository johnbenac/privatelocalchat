// wllama (llama.cpp compiled to WebAssembly + WebGPU) adapter, OPFS storage operations, for the light tier (Qwen3.5-2B Q4_0).
// Provenance: productionised from spikes/llm/provider/adapters/wllama.js (FAB-02). Runtime: the owner's vendored wllama.js and wasm
// build retained-v1q-chat-stable-slim-20260901 (../vendor/wllama/v1q/, copied from spikes/llm/vendor/wllama/v1q/; origin
// /srv/speechtest-recovered commit 3f8549ce7b6c08dd453a05be374d12afcbba73e0, one patch: absoluteUrl() works inside a Worker).
//
// Production changes: the adapter never downloads (storageOps.install does, visibly and with size + SHA-256 checks against the owner's
// immutable manifest); load() refuses with not-installed / cache-corrupt; no grammar exists in this build, so a structured request is
// ANSWERED BY VALIDATION: the host checks the finished text against the schema and a miss is attempt-failed (output-invalid), never repaired.
// The adapter does not rewrite the mind's prompt: the mind must put the schema instruction in the prompt itself.
import { compareInventory, planInstall, createRateTracker } from "../verify.mjs";
import {sha256OfBlob} from '../hash-blob.mjs';
import {shutdownNativeRuntime} from '../native-shutdown.mjs';
import { preflight as webgpuPreflight } from "./webgpu.mjs";
import {retryDownload} from '../download-retry.mjs';
import {writeOpfsStream} from '../opfs-stream-writer.mjs';
import {createCacheApiBackend} from '../cache-api-backend.mjs';
import {createThinkFilter} from '../think.mjs';
export async function preflight(config) {
  if (config?.backend === "cpu") { // the processor runs the model: only WebAssembly is needed, not a graphics card
    if (typeof WebAssembly === "undefined") throw Object.assign(new Error("This browser cannot run WebAssembly, which running the model on the processor needs."), { name: "WebGpuUnavailable" });
    return;
  }
  await webgpuPreflight();
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter?.features.has('shader-f16')) throw Object.assign(new Error('This on-device runtime requires shader-f16, which this browser does not expose. Choose the 9B model if this device has enough memory, or explicitly select API mode.'),{name:'WebGpuUnavailable'});
}

const wllamaCache = new Map(); // runtime dir -> Wllama (used only for its cache manager in storage ops)

// Where the model files are kept: OPFS, the browser's file storage, unless it cannot be opened, as on an iPhone 11 Pro's Safari 18 (navigator.storage.getDirectory()
// rejects with "unknown transient reason"; its IndexedDB cannot store Blobs either, which is why the files are not kept there). Then the Cache API. Decided once per worker
// by really opening the cache directory.
let storageKind = null;
const CACHE_API_NAME = "plc-model-files-v1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Can the cache directory be opened? The failure is described as "transient", so it is tried a few times before it is believed. */
async function opfsOpens() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { const root = await navigator.storage.getDirectory(); await root.getDirectoryHandle("cache", { create: true }); return true; }
    catch { if (attempt < 2) await sleep(250 * (attempt + 1)); }
  }
  return false;
}
const countOpfsFiles = async () => { try { const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle("cache"); let n = 0; for await (const _ of dir.entries()) n++; return n; } catch { return 0; } };
const cacheApiHoldsFiles = async () => { try { return (await caches.has(CACHE_API_NAME)) && (await (await caches.open(CACHE_API_NAME)).keys()).length > 0; } catch { return false; } };
async function chooseStorage() {
  if (storageKind) return storageKind;
  const cacheApi = createCacheApiBackend().isSupported();
  if (!(await opfsOpens())) storageKind = cacheApi ? "cache-api" : "opfs";
  // OPFS opens now, but a model saved while it did not is in the Cache API: keep using that, or the app would look in the wrong place and download it again
  else if (cacheApi && (await cacheApiHoldsFiles()) && (await countOpfsFiles()) === 0) storageKind = "cache-api";
  else storageKind = "opfs";
  return storageKind;
}
/** Make this Wllama's cache manager use the storage that works here. */
async function useStorage(w) {
  const kind = await chooseStorage();
  if (kind === "cache-api") { w.cacheManager.sb = createCacheApiBackend(); return kind; }
  // Keep the pinned cache keys/metadata while owning failure-safe writer cleanup.
  // The vendored writer can retain a Worker when opening or closing a file rejects.
  w.cacheManager.sb.priv.write = (key, stream) => writeOpfsStream(key, stream);
  return "opfs";
}

async function openRuntime(runtimeDir) {
  const base = new URL(runtimeDir.endsWith("/") ? runtimeDir : runtimeDir + "/", self.location.href).href;
  const { Wllama } = await import(/* @vite-ignore */ base + "wllama.js");
  return { base, Wllama };
}

// The runtime refuses to start ("No supported storage backend found") when the browser has no OPFS API at all (an old Safari, WebKit under test). Give it one that refuses
// to open: chooseStorage() then sees the refusal and moves the files to the fallback.
function ensureStorageShape() {
  try {
    const nav = self.navigator;
    if (!nav.storage) Object.defineProperty(nav, "storage", { value: {}, configurable: true });
    if (typeof nav.storage.getDirectory !== "function") Object.defineProperty(nav.storage, "getDirectory", { value: () => Promise.reject(Object.assign(new Error("OPFS is not available in this browser"), { name: "NotSupportedError" })), configurable: true, writable: true });
  } catch { /* a frozen navigator: the runtime will say what is missing */ }
}

async function cacheManagerFor(runtimeDir) {
  let w = wllamaCache.get(runtimeDir);
  if (!w) {
    const { base, Wllama } = await openRuntime(runtimeDir);
    ensureStorageShape();
    w = new Wllama({ default: base + "default.wasm", "single-thread/wllama.wasm": base + "default.wasm" }, { useMultiThread: false, allowOffline: true, logger: { debug() {}, log() {}, warn() {}, error() {} } });
    await useStorage(w);
    wllamaCache.set(runtimeDir, w);
  }
  return w.cacheManager;
}

async function measure(cm, files) {
  const list = await cm.list(); const actual = new Map(); const noMeta = [];
  for (const f of files) {
    const name = await cm.getNameFromURL(f.url);
    const entry = list.find((e) => e.name === name);
    if (!entry) continue;
    const m = entry.metadata;
    // an interrupted download leaves bytes without metadata (metadata is written last): never a usable file
    if (!m?.originalURL || m.originalSize !== entry.size) { actual.set(f.path, -1); noMeta.push(f.path); continue; }
    actual.set(f.path, entry.size);
  }
  return { actual, noMeta };
}

async function inspect({ files, runtimeDir }) {
  const t0 = performance.now(); const cm = await cacheManagerFor(runtimeDir);
  const { actual, noMeta } = await measure(cm, files);
  const inv = compareInventory(files, actual);
  return { ...inv, partialNoMetadata: noMeta, ms: Math.round(performance.now() - t0), engine: "wllama", where: storageKind === "cache-api" ? "Cache API (OPFS cannot be opened in this browser)" : "OPFS (wllama cache)", storage: storageKind };
}

async function verify({ files, runtimeDir, deep = false }, hooks = {}) {
  const inv = await inspect({ files, runtimeDir });
  if (!deep) return { ...inv, deep: false, hashMismatch: [] };
  const cm = await cacheManagerFor(runtimeDir); const hashMismatch = []; let done = 0;
  for (const f of files) {
    if (hooks.signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    if (inv.missing.includes(f.path) || inv.bad.some((b) => b.path === f.path)) continue;
    const blob = await cm.open(f.url); if (!blob) { hashMismatch.push({ path: f.path, why: "unreadable" }); continue; }
    const got = await sha256OfBlob(blob,{signal:hooks.signal});
    if (f.sha256 && got !== f.sha256) hashMismatch.push({ path: f.path, want: f.sha256, got, why: "sha256" });
    hooks.onProgress?.({ phase: "hash", filesDone: ++done, filesTotal: files.length });
  }
  const state = hashMismatch.length ? "corrupt" : inv.state;
  return { ...inv, state, ok: state === "complete", deep: true, hashMismatch, bad: [...inv.bad, ...hashMismatch] };
}

async function removeFiles({ files, runtimeDir, paths = null }) {
  const cm = await cacheManagerFor(runtimeDir); let removed = 0;
  for (const f of files) { if (paths && !paths.includes(f.path)) continue; await cm.delete(f.url); removed++; }
  return { removed, requested: removed };
}

async function install({ files, runtimeDir, verifyHash = true, deep = false }, { onProgress, signal } = {}) {
  const cm = await cacheManagerFor(runtimeDir);
  const inv = deep ? await verify({ files, runtimeDir, deep: true }, { signal }) : await inspect({ files, runtimeDir });
  const plan = planInstall(files, inv);
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const rate = createRateTracker({ windowMs: 6000 });
  // files with partial bytes but no metadata are not in inv.bad (they were reported as -1 => wrongSize => bad); delete them first, loudly
  for (const p of plan.deleteFirst) { const f = files.find((x) => x.path === p); await cm.delete(f.url); }
  for (const f of plan.todo) { const name = await cm.getNameFromURL(f.url); await cm.delete(name).catch(() => {}); } // an orphan without metadata
  let fetched = 0; let filesDone = files.length - plan.todo.length;
  const report = (active,extra={}) => { const t = performance.now(); rate.add(fetched, t); onProgress?.({ phase: "install", bytesDone: plan.bytesKept + fetched, bytesKept: plan.bytesKept, bytesTotal: total, filesDone, filesTotal: files.length, active: active ? [active] : [], bytesPerSecond: rate.bytesPerSecond(), etaSeconds: rate.etaSeconds(plan.bytesToFetch - fetched),...extra }); };
  report(null);
  for (const f of plan.todo) {
    if (signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    await retryDownload(async()=>{
    let mine = 0; let lastT = 0;
    report(f.path);
    try {
      await cm.download(f.url, { signal, progressCallback: ({ loaded }) => { fetched += loaded - mine; mine = loaded; const t = performance.now(); if (t - lastT > 400) { lastT = t; report(f.path); } } });
      const m = await cm.getMetadata(await cm.getNameFromURL(f.url));
      const size = await cm.getSize(await cm.getNameFromURL(f.url));
      if (size !== f.bytes || (m && m.originalSize && m.originalSize !== f.bytes)) throw Object.assign(new Error(`download size mismatch for ${f.path}: stored ${size} bytes, the catalogue says ${f.bytes}`), { code: "cache-corrupt" });
      if (verifyHash && f.sha256) {
        const blob = await cm.open(f.url);
        const got = blob ? await sha256OfBlob(blob,{signal}) : "unreadable";
        if (got !== f.sha256) throw Object.assign(new Error(`checksum mismatch for ${f.path}: sha256 ${got}, the catalogue says ${f.sha256}`), { code: "cache-corrupt" });
      }
    } catch (e) {
      fetched -= mine;
      await cm.delete(f.url).catch(() => {}); // leave nothing half-written behind
      throw e;
    }
    },{signal,onRetry:extra=>{rate.reset();report(f.path,extra);}});
    filesDone++; report(null);
  }
  const after = await inspect({ files, runtimeDir });
  if (!after.ok) throw Object.assign(new Error(`cache-incomplete after install: ${after.missing.length} missing, ${after.bad.length} bad`), { code: "cache-corrupt", detail: { missing: after.missing.slice(0, 20), bad: after.bad.slice(0, 20) } });
  return { ...after, fetchedBytes: fetched, keptBytes: plan.bytesKept, replaced: plan.deleteFirst, filesFetched: plan.todo.length };
}

export const storageOps = { inspect, verify, install, remove: removeFiles, repair: (args, hooks) => install({ ...args, deep: true }, hooks) };

export class WllamaAdapter {
  constructor() { this.w = null; this.info = null; this.cfg = null; }

  async load(config, { onProgress }) {
    const cfg = this.cfg = config;
    const rt = cfg.runtime;
    if (!Array.isArray(cfg.files) || cfg.files.length === 0) throw Object.assign(new Error("wllama load config needs the catalogue file list (config.files)"), { name: "ConfigError" });
    // 1) the OPFS cache must hold exactly the catalogue
    const tr = performance.now();
    const inv = await inspect({ files: cfg.files, runtimeDir: rt.dir });
    const cacheCheckMs = Math.round(performance.now() - tr);
    if (!inv.ok) {
      const what = inv.state === "corrupt"
        ? `cache-corrupt: ${inv.bad.length} model file(s) in the browser cache do not match the catalogue (${inv.bad.slice(0, 4).map((b) => `${b.path} is ${b.got} bytes, expected ${b.want}`).join("; ")})`
        : `not-installed: ${inv.missing.length} of ${inv.files} model files are not in the browser cache`;
      throw Object.assign(new Error(what), { name: "ModelCacheError", detail: { state: inv.state, missing: inv.missing.slice(0, 20), bad: inv.bad.slice(0, 20) } });
    }
    const { base, Wllama } = await openRuntime(rt.dir);
    const compatRes = await fetch(base + "compat-worker.js", { cache: "force-cache", credentials: "omit" });
    if (!compatRes.ok) throw new Error(`compat-worker-http-${compatRes.status}`);
    const compatCode = await compatRes.text();
    this.nativeLines = [];
    const k = cfg.knobs || {};
    const nativeError=(...args)=>{
      this._native(args);
      /* DEV_DIAGNOSTICS_START */
      if(k.devDiagnostics)for(const value of args)if(value?.plcDeviceError){
        try{globalThis.postMessage({type:'native-device-error',error:value.plcDeviceError});}catch{}
      }
      /* DEV_DIAGNOSTICS_END */
    };
    const quiet = { debug: (...a) => this._native(a), log: (...a) => this._native(a), warn: (...a) => this._native(a), error: nativeError };
    ensureStorageShape();
    this.w = new Wllama({ default: base + "default.wasm", "single-thread/wllama.wasm": base + "default.wasm" }, {
      useMultiThread: false, parallelDownloads: 1, allowOffline: true, expectedBuildId: rt.buildId, forceCompat: rt.cls === "compat", logger: quiet
    });
    this.w.setCompat({ wasm: base + "compat.wasm", worker: { code: compatCode } }, "firefox_safari");
    await useStorage(this.w); // the same storage the files were saved to (OPFS, or the Cache API where OPFS cannot be opened)
    const res = this.w.getWorkerResources();
    if ((rt.cls === "compat") !== (res.compat === true)) throw new Error(`runtime class mismatch: wanted ${rt.cls}, got compat=${res.compat}`);
    /* DEV_DIAGNOSTICS_START */
    if(k.devDiagnostics){
      this.w.setLifecycleListener?.(event=>onProgress?.({phase:'native-'+event.phase}));
      this.w.setLedgerListener?.(event=>onProgress?.({phase:'native-ledger',memory:event}));
      if(k.devDiagnosticsDisk)this.w.enableFlightRecorder?.(crypto.getRandomValues(new Uint8Array(16)));
    }
    /* DEV_DIAGNOSTICS_END */
    if (k.initialMemoryMiB) this.w.setFlightKnobs?.({ initialMemoryMiB: k.initialMemoryMiB });
    if (k.offloadTiedEmbedding) this.w.enableTiedEmbeddingOffload?.({ schemaField: true });
    if (k.progressiveSourceRelease) this.w.enableProgressiveSourceRelease?.({ recycleWindowBytes: k.recycleWindowBytes || 0 });

    const url = new URL(cfg.modelUrl, self.location.href).href;
    const timings = { cacheCheckMs };
    const models = await this.w.modelManager.getModels();
    const model = models.find((m) => m.url === url);
    if (!model) throw Object.assign(new Error("not-installed: wllama's own model list does not contain the verified files (run Repair)"), { name: "ModelCacheError" });
    timings.stagedFrom = "cache"; timings.stagedBytes = model.size;

    const c = cfg.context || {};
    const tCons0 = performance.now();
    onProgress?.({ phase: "construct-begin" });
    try { await this.w.loadModelFromUrl(url, {
      n_ctx: c.n_ctx ?? 4096, n_batch: c.n_batch, n_ubatch: c.n_ubatch, n_threads: 1, n_parallel: 1,
      cache_type_k: c.cache_type_k ?? "f16", cache_type_v: c.cache_type_v ?? "f16",
      flash_attn_policy: c.flash_attn_policy, fused_gdn_auto: c.fused_gdn_auto, fused_gdn_ar: c.fused_gdn_ar, fused_gdn_ch: c.fused_gdn_ch,
      sched_max_splits_hint: c.sched_max_splits_hint, ctx_checkpoints: c.ctx_checkpoints, checkpoint_every_n_tokens: c.checkpoint_every_n_tokens, checkpoint_clear_policy: c.checkpoint_clear_policy, jinja: c.jinja ?? true, reasoning: false, reasoning_budget_tokens: 0, n_gpu_layers: c.n_gpu_layers ?? -1,
      no_kv_offload: false, cache_idle_slots: false, warmup: c.warmup ?? false, useCache: true, parallelDownloads: 1,
      progressCallback: () => {}
    });
    } catch (error) {
      error.detail = {...error.detail, nativeLog: this.nativeLines.slice(-30)};
      error.message += ' ' + this.nativeLines.slice(-4).join(' | ');
      throw error;
    }
    onProgress?.({phase:"construct-returned"});
    timings.constructMs = Math.round(performance.now() - tCons0);
    if (k.progressiveSourceRelease) { try { this.w.releaseModelSource?.(); } catch (e) { this._native([`releaseModelSource failed: ${e?.message || e}`]); } }

    onProgress?.({phase:"source-released"});
    this.w.cacheManager.sb.forget?.(); // the Cache API backend keeps the file's Blob while the runtime may re-open it; the model is loaded now
    const ctx = this.w.getLoadedContextInfo();
    const meta = ctx.metadata || {};
    this.info = {
      modelId: cfg.modelId, runtime: `wllama/${rt.buildId}/${rt.cls}`, timings,
      context: { n_ctx: ctx.n_ctx, n_batch: ctx.n_batch, n_ubatch: ctx.n_ubatch, n_vocab: ctx.n_vocab, n_ctx_train: ctx.n_ctx_train },
      gguf: { arch: meta["general.architecture"], name: meta["general.name"], file_type: meta["general.file_type"] },
      capabilities: {
        kind: cfg.backend === "cpu" ? "local-cpu" : "local-webgpu", structuredEnforced: [], structuredValidated: ["json-schema", "json-object"], structuredEnforcement: { json_schema: "validated", json_object: "validated" },
        quantization: cfg.quantization || null, license: cfg.license || null, runtimeName: "wllama", runtimeVersion: rt.buildId,
        contextWindowTokens: ctx.n_ctx, maxOutputTokens: 1024
      }
    };
    onProgress?.({phase:"context-ready"});
    this.info.runtimeMemory = await this._mem();
    onProgress?.({phase:"memory-ready"});
    return this.info;
  }

  _native(args) { const t = args.map(String).join(" ").slice(0, 300); this.nativeLines.push(t); if (this.nativeLines.length > 400) this.nativeLines.shift(); }
  async _mem() { try { return await this.w.getRuntimeMemory(); } catch (e) { return { error: String(e?.message || e) }; } }

  async run(req, signal, emit) {
    const s = req.sampling || {};
    const params = {
      messages: req.messages, stream: true, abortSignal: signal, cache_prompt: req.cachePrompt !== false,
      temperature: s.temperature ?? 0, top_p: s.topP ?? 1, top_k: s.topK ?? (s.temperature ? 40 : 1), seed: s.seed ?? 1,
      chat_template_kwargs: { enable_thinking: req.thinking === true }
    };
    if (req.maxTokens !== undefined) params.max_tokens = req.maxTokens; // omitted: no limit before the context window
    if (s.repetitionPenalty) params.repeat_penalty = s.repetitionPenalty;
    if (req.stop?.length) params.stop = req.stop;
    /* DEV_DIAGNOSTICS_START */
    let debugChunks=0,debugCompleted=false;
    const debugFence=async(op,edge)=>{
      if(!this.cfg?.knobs?.devDiagnosticsDisk)return;
      try{await this.w.flightMark(10,op,edge,debugChunks,0);}catch(error){this._native(['Development generation checkpoint unavailable: '+error.name]);}
    };
    await debugFence(1,1);
    if(req.debugCapture&&this.cfg?.knobs?.devDiagnostics)emit({diagnostic:{kind:'native-request',object:{...params,abortSignal:{aborted:signal?.aborted===true}}}});
    try {
    /* DEV_DIAGNOSTICS_END */
    const gen = await this.w.createChatCompletion(params);
    let usage = null; let finish = null; let timings = null;
    // LFM2.5 writes empty think blocks ahead of its answer; they are not part of the reply
    const thinkFilter = createThinkFilter();
    // the runtime's iterator is a down-levelled hand-written one; consumed with next() like every other token path here
    const it = gen[Symbol.asyncIterator]();
    for (;;) {
      const { value: chunk, done } = await it.next();
      if (done) break;
      /* DEV_DIAGNOSTICS_START */
      if(req.debugCapture&&this.cfg?.knobs?.devDiagnostics)emit({diagnostic:{kind:'native-chunk',object:chunk}});
      /* DEV_DIAGNOSTICS_END */
      const choice = chunk?.choices?.[0];
      const delta = choice?.delta?.content ?? choice?.text ?? "";
      const visible = delta ? thinkFilter.push(delta) : "";
      if (visible) {
        emit({ delta: visible });
        /* DEV_DIAGNOSTICS_START */
        debugChunks++;
        if([1,16,64,128,256,512].includes(debugChunks))await debugFence(2,2);
        /* DEV_DIAGNOSTICS_END */
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (chunk?.usage) usage = chunk.usage;
      if (chunk?.timings) timings = chunk.timings;
    }
    const tailText = thinkFilter.flush();
    if (tailText) emit({ delta: tailText });
    emit({
      usage: {
        promptTokens: usage?.prompt_tokens ?? null, completionTokens: usage?.completion_tokens ?? null,
        cachedPromptTokens: usage?.prompt_tokens_details?.cached_tokens ?? usage?.prompt_tokens_reused ?? null,
        engineTimings: timings || null, ...this._diagUsage()
      },
      finish: finish === "length" ? "length" : "stop"
    });
    /* DEV_DIAGNOSTICS_START */
    debugCompleted=true;
    } finally {await debugFence(debugCompleted?3:4,signal?.aborted?3:2);}
    /* DEV_DIAGNOSTICS_END */
  }

  _diagUsage() {
    const d = this.w?.getLastGenerationDiagnostics?.();
    if (!d?.usage) return {};
    return { promptTokens: d.usage.promptTokens, cachedPromptTokens: d.usage.reusedTokens, completionTokens: d.usage.completionTokens, nativeTiming: d.timing || null };
  }

  async stats() {
    /* DEV_DIAGNOSTICS_START */
    if(this.cfg?.knobs?.devDiagnostics)return {runtimeMemory:await this._mem(),sourceCounters:this.w?.getModelSourceCounters?.(),lastGenerationDiagnostics:this.w?.getLastGenerationDiagnostics?.(),nativeLinesSample:this.nativeLines?.slice(-40)??[],info:this.info};
    /* DEV_DIAGNOSTICS_END */
    return { runtimeMemory: await this._mem(), lastGenerationDiagnostics: this.w?.getLastGenerationDiagnostics?.() ?? null, nativeLinesSample: this.nativeLines?.slice(-40) ?? [], info: this.info };
  }

  async unload() {
    try { return await shutdownNativeRuntime(this.w); } finally { this.w = null; }
  }
}
