// The engine registry as a page uses it: the registry core plus the support explanation, the page-host guard and the wrapper for engines that ship their own worker.
// The Worker entry does not import this file (it needs only registry-core.mjs), so the default Worker path does not pay for any of it.
//
//   const registry = createEngineRegistry().register("kokoro", { kind: "speech-synthesis", group: "speech-out", ops: ["synthesize"], createAdapter: () => new KokoroAdapter() });
//   startHostWorker(registry);                       // in the Worker entry
//   explainSupport(manifest, env, registry);         // {supported, reason, detail}
import { createEngineRegistry, defaultRegistry, ENGINE_KINDS } from "./registry-core.mjs";
export { createEngineRegistry, defaultRegistry, ENGINE_KINDS };

/** Why a model is unsupported here. Frozen and additive-only: a code is never renamed, a new one is added. */
export const REASON_CODES = Object.freeze([
  "no-adapter-for-format", "needs-webgpu", "needs-shader-f16", "needs-threads", "needs-cross-origin-isolation", "needs-opfs",
  "engine-version-mismatch", "memory-over-budget", "storage-unavailable", "storage-quota", "download-incomplete", "manifest-invalid",
  "closure-mismatch", "slot-unfilled", "licence-acceptance-required", "source-not-approved",
  // added with the verifier and the sources (frozen, additive only): what a bundle, an archive or a closure can be refused for
  "ambiguous-archive", "linked-member", "unsafe-name", "closure-unchecked", "dependency-unpinned"
]);
/**
 * Can this manifest run on this device? `manifest` is a derived model manifest ({view:{engine, needs, slots, terms}}) or the same fields at the top level.
 * `opts.accepted` is true when the person has accepted a licence that requires acceptance. Returns {supported, reason, detail}; reason is one of REASON_CODES.
 */
export function explainSupport(manifest, env, registry, opts = {}) {
  const no = (reason, detail = null) => ({ supported: false, reason, detail });
  if (!manifest || typeof manifest !== "object") return no("manifest-invalid", { why: "no manifest" });
  const view = manifest.view ?? manifest;
  const engineName = view.engine?.name ?? manifest.runtime?.engine ?? null;
  if (typeof engineName !== "string" || !registry?.has?.(engineName)) return no("no-adapter-for-format", { engine: engineName });
  const spec = registry.get(engineName);
  if (Array.isArray(spec.engineVersions) && view.engine?.version != null && !spec.engineVersions.includes(view.engine.version)) return no("engine-version-mismatch", { engine: engineName, wanted: view.engine.version, have: [...spec.engineVersions] });
  const needs = view.needs ?? {}; const e = env ?? {};
  if (needs.webgpu && !e.webgpu?.available) return no("needs-webgpu", { reason: e.webgpu?.reason ?? null });
  if (needs.shaderF16 && !e.webgpu?.shaderF16) return no("needs-shader-f16");
  if (needs.threads && !e.crossOriginIsolated) return no("needs-threads");
  if (needs.crossOriginIsolated && !e.crossOriginIsolated) return no("needs-cross-origin-isolation");
  if (needs.opfs && e.opfs === false) return no("needs-opfs");
  if (needs.storageBytes && e.storage?.quota != null && e.storage.quota - (e.storage.usage ?? 0) < needs.storageBytes) return no("storage-quota", { needed: needs.storageBytes, free: e.storage.quota - (e.storage.usage ?? 0) });
  const unfilled = (view.slots ?? []).filter((s) => s?.required && !s.filled).map((s) => s.name);
  if (unfilled.length) return no("slot-unfilled", { slots: unfilled });
  if (view.terms?.acceptance?.required && opts.accepted !== true) return no("licence-acceptance-required", { termsUrl: view.terms.acceptance.termsUrl ?? null });
  if (typeof spec.supports === "function") {
    const own = spec.supports(manifest, e);
    if (own && own.ok === false) return no(REASON_CODES.includes(own.reason) ? own.reason : "manifest-invalid", own.detail ?? null);
  }
  return { supported: true, reason: null, detail: null };
}

const HOST_KEY = Symbol.for("model-runtime.pageHost");
/**
 * The page's one host. `create` makes it (for example createModelHost); a second compatible acquisition returns the same host.
 * A second acquisition whose catalog or sources differ from the first would change what a load does, and throws `host-conflict`;
 * anything else is recorded as a notice on the host and the existing host is returned.
 */
export function acquirePageHost(create, options = {}, scope = globalThis) {
  // Compared as data on purpose: hooks (probes, credentials, a device gate) are functions and do not change WHAT a model is or where its files come from, only how a
  // consumer decides; two acquisitions with different hooks but the same catalog and sources are the same host.
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const held = scope[HOST_KEY];
  if (held) {
    if (!same(held.options.catalogId, options.catalogId) || !same(held.options.sources, options.sources)) {
      throw Object.assign(new Error("a model host already exists on this page with a different catalog or different sources"), { class: "invalid-request", code: "host-conflict" });
    }
    return held.host;
  }
  const host = create(options);
  scope[HOST_KEY] = { host, options: { catalogId: options.catalogId, sources: options.sources } };
  return host;
}
export function _resetPageHost(scope = globalThis) { delete scope[HOST_KEY]; }

/**
 * Wrap an engine that ships its OWN worker as an adapter. The engine keeps its own message vocabulary; `protocol` maps the host's operations onto it:
 *   protocol.load(config) / invoke(id, name, request) / abort(id) / unload()   -> the message to post
 *   protocol.decode(message) -> {id?, type: "loaded"|"progress"|"part"|"result"|"error", value?, transfer?}
 * The host still owns load, unload, the budget and abort, and the one-terminal-event guarantee.
 */
export function createWorkerEngine({ url, createWorker, protocol }) {
  return () => {
    let worker = null; let seq = 0; const waiting = new Map(); let loadWaiter = null;
    const post = (m, transfer) => (transfer?.length ? worker.postMessage(m, transfer) : worker.postMessage(m));
    const onMessage = (e) => {
      const d = protocol.decode(e.data); if (!d) return;
      if (d.type === "loaded" || (d.type === "error" && d.id == null && loadWaiter) || (d.type === "progress" && d.id == null)) {
        if (d.type === "progress") return loadWaiter?.onProgress?.(d.value);
        const w = loadWaiter; loadWaiter = null; if (!w) return; return d.type === "loaded" ? w.resolve(d.value ?? {}) : w.reject(Object.assign(new Error(d.value?.message ?? "the engine worker failed to load"), d.value ?? {}));
      }
      const w = waiting.get(d.id); if (!w) return;
      if (d.type === "part") return w.emit(d.value, d.transfer);
      waiting.delete(d.id);
      if (d.type === "result") w.resolve(d.value); else w.reject(Object.assign(new Error(d.value?.message ?? "the engine worker failed"), d.value ?? {}));
    };
    return {
      async load(config, { onProgress } = {}) {
        worker = createWorker(url);
        worker.onmessage = onMessage;
        worker.onerror = (e) => { const err = Object.assign(new Error(e?.message || "the engine worker crashed"), { name: "EngineWorkerError" }); loadWaiter?.reject(err); for (const w of waiting.values()) w.reject(err); waiting.clear(); };
        const loaded = new Promise((resolve, reject) => { loadWaiter = { resolve, reject, onProgress }; });
        post(protocol.load(config));
        return loaded;
      },
      invoke(name, request, signal, emit) {
        const id = ++seq;
        return new Promise((resolve, reject) => {
          waiting.set(id, { resolve, reject, emit });
          const stop = () => { if (waiting.has(id)) post(protocol.abort(id)); };
          if (signal?.aborted) stop(); else signal?.addEventListener("abort", stop, { once: true });
          post(protocol.invoke(id, name, request));
        });
      },
      async unload() { try { if (worker && protocol.unload) post(protocol.unload()); } finally { worker?.terminate?.(); worker = null; waiting.clear(); } },
      async stats() { return { worker: worker ? "running" : "none" }; }
    };
  };
}
