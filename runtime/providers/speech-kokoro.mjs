// SPDX-License-Identifier: AGPL-3.0-only
// The speech-synthesis adapter family, first member: the standalone Kokoro engine, WRAPPED and not rewritten (docs/EXTENSION-DESIGN.md 3.1, 0.10).
//
// A SEPARATE ENTRY. Nothing in the default path (registry-core, registry, runtime, host.worker, worker-entry) imports this file, so a consumer that never imports it ships and
// inherits none of it. It imports nothing at all: the engine is INJECTED (`createEngine`), so this file loads no worker, no network and no ONNX runtime itself.
//
// LICENCE BOUNDARY. This adapter is AGPL-3.0-only, like the package. The phonemizer that speaks the text (eSpeak NG, GPL-3.0-or-later) is NOT in this file: it is inside the
// engine's own module worker, a separate artifact the consumer hosts and notices. A consumer that does not register this entry never receives it.
//
//   import { registerKokoro, kokoroHooks } from "./speech-kokoro.mjs";
//   import { createKokoroEngine } from "<the engine package's module>";
//   const registry = registerKokoro(defaultRegistry(), { createEngine: (o) => createKokoroEngine({ workerUrl: o.workerUrl }), manifest });
//   startHostWorker(registry, { hooks: kokoroHooks });             // hooks: so an engine error keeps its stable code
//   // load:   engine-load { engine: "kokoro", config: { base, workerUrl, threads?, files? } }   (files default to the manifest's engine files)
//   // speak:  invoke { engine: "kokoro", name: "synthesize", request: { invocationId, text, voice?, speed?, firstChunkSplit? } }
//   // each chunk arrives as an `invoke-part`: { index, count, text, ipa, sampleRate, samples: Float32Array (mono) }; its buffer is TRANSFERRED, not copied.

export const KOKORO_ENGINE_ROLES = Object.freeze(["model", "tokenizer", "tokenizer_config", "config", "voice"]);
export const KOKORO_SAMPLE_RATE = 24000;

/** The engine's own error codes, kept as the stable code of the terminal event (never renamed, additive only), with the host class each belongs to. */
export const KOKORO_ERROR_CODES = Object.freeze({
  "bad-config": { cls: "invalid-request", providerFault: false },
  "bad-file-list": { cls: "invalid-request", providerFault: false },
  "network": { cls: "load-failed", providerFault: false },
  "http-error": { cls: "load-failed", providerFault: false },
  "bad-size": { cls: "load-failed", providerFault: false },
  "bad-hash": { cls: "load-failed", providerFault: false },
  "not-loaded": { cls: "provider-unavailable", providerFault: false },
  "unknown-voice": { cls: "invalid-request", providerFault: false },
  "worker-failed": { cls: "runtime-fault", providerFault: true },
  "aborted": { cls: "aborted", providerFault: false }
});

const ADVICE = {
  "bad-config": "The voice engine was given an address or a setting it cannot use. This is a bug in the page that configured it.",
  "bad-file-list": "The list of voice files is not valid. This is a bug in the page that configured it.",
  "network": "Fetching a voice file failed. Check the connection and try again: files that were verified are kept.",
  "http-error": "The server did not give a voice file. Try again later.",
  "bad-size": "A voice file was not the size it must be and was refused. Nothing was loaded. Try again.",
  "bad-hash": "A voice file did not match its SHA-256 and was refused. Nothing was loaded. Try again.",
  "not-loaded": "The voice is not loaded. Load it first.",
  "unknown-voice": "That voice is not one of the voices that were loaded.",
  "worker-failed": "The voice engine's worker stopped. Nothing was retried; load the voice again.",
  "aborted": "The operation was cancelled."
};

/** classifyError for createHost / startHostWorker (`hooks`): an engine error keeps its own stable code. Anything else falls through to the built-in classification. */
export function classifyKokoroError(err, _ctx, _base) {
  const known = err && err.name === "KokoroEngineError" ? KOKORO_ERROR_CODES[err.code] : null;
  if (!known) return undefined;
  return { class: known.cls, code: err.code, reason: err.code, providerFault: known.providerFault, recoverable: false, advice: ADVICE[err.code] };
}
export const kokoroHooks = Object.freeze({ classifyError: classifyKokoroError });

const engineError = (code, message) => Object.assign(new Error(message), { name: "KokoroEngineError", code });
const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });

/** The engine's pinned file list from a manifest: {path, role, bytes, sha256}, engine roles only (the licence file is not fetched by an install). */
export function engineFilesOf(manifest) {
  const arts = manifest?.descriptor?.artifacts;
  if (!Array.isArray(arts)) return null;
  // a descriptor role has hyphens where the engine's has underscores (tokenizer-config / tokenizer_config)
  return arts.map((a) => ({ path: a.name, role: String(a.role).replace(/-/g, "_"), bytes: a.bytes, sha256: a.sha256 })).filter((f) => KOKORO_ENGINE_ROLES.includes(f.role));
}

/** A samples chunk whose buffer may be transferred WITHOUT shipping bytes the chunk does not own (a view into a bigger buffer is copied once). */
function ownedSamples(samples) {
  if (!(samples instanceof Float32Array)) return null;
  if (samples.byteOffset === 0 && samples.buffer.byteLength === samples.byteLength && samples.buffer instanceof ArrayBuffer) return samples;
  return samples.slice();
}

export class KokoroAdapter {
  constructor({ createEngine, manifest = null } = {}) {
    if (typeof createEngine !== "function") throw new TypeError("KokoroAdapter: createEngine (a function returning an engine) is required");
    this.createEngine = createEngine; this.manifest = manifest; this.engine = null; this.loading = null; this.voices = [];
  }
  async load(config = {}, { onProgress } = {}) {
    const files = config.files ?? engineFilesOf(this.manifest);
    if (!files) throw engineError("bad-file-list", "no file list: give config.files or register the engine with a manifest");
    if (typeof config.base !== "string") throw engineError("bad-config", "config.base (where the files are served from) is required");
    const engine = this.createEngine({ workerUrl: config.workerUrl });
    if (!engine || typeof engine.init !== "function" || typeof engine.speak !== "function") throw engineError("bad-config", "createEngine did not return an engine");
    this.engine = engine; this.loading = new AbortController(); let loaded = null;
    try {
      const init = await engine.init({ base: config.base, files });
      loaded = await engine.load({ signal: this.loading.signal, threads: config.threads ?? 1, onProgress: (p) => onProgress?.({ phase: "download", loaded: p?.bytesDone ?? 0, total: p?.bytesTotal ?? 0, path: p?.path }) });
      this.voices = loaded?.voices ?? init?.voices ?? [];
    } catch (e) { const dead = this.engine; this.engine = null; try { await dead?.unload?.(); } catch { /* the load failed already */ } throw e; }
    finally { this.loading = null; }
    return { modelId: config.modelId ?? "kokoro", capabilities: { kind: "speech-synthesis", sampleRate: KOKORO_SAMPLE_RATE, voices: [...this.voices], threads: threadsOf(this.engine) } };
  }
  async invoke(name, request, signal, emit) {
    if (name !== "synthesize") throw engineError("bad-config", `kokoro answers synthesize, not ${String(name)}`);
    const engine = this.engine;
    if (!engine) throw engineError("not-loaded", "the engine is not loaded");
    if (typeof request?.text !== "string") throw Object.assign(new TypeError("synthesize needs request.text (a string)"), { name: "KokoroEngineError", code: "bad-config" });
    const onAbort = () => { try { engine.cancel?.(); } catch { /* already gone */ } };
    if (signal?.aborted) throw abortError();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const out = await engine.speak(request.text, {
        voice: request.voice, speed: request.speed ?? 1, signal, firstChunkSplit: request.firstChunkSplit,
        onChunk: (c) => {
          if (signal?.aborted) return;
          const samples = ownedSamples(c.samples); if (!samples) return;
          emit({ index: c.index, count: c.count, text: c.text, ipa: c.ipa ?? null, sampleRate: c.sampleRate ?? KOKORO_SAMPLE_RATE, samples }, [samples.buffer]);
        }
      });
      if (signal?.aborted) throw abortError();
      return { chunks: out?.chunks ?? null, samples: out?.samples ?? null, audioSeconds: out?.audioSeconds ?? null, synthMs: out?.synthMs ?? null, firstAudioMs: out?.firstAudioMs ?? null, sampleRate: out?.sampleRate ?? KOKORO_SAMPLE_RATE, cancelled: Boolean(out?.cancelled) };
    } catch (e) {
      if (signal?.aborted || e?.code === "aborted") throw abortError();
      throw e;
    } finally { signal?.removeEventListener("abort", onAbort); }
  }
  async unload() {
    const engine = this.engine; this.engine = null; this.voices = [];
    this.loading?.abort();
    try { await engine?.unload?.(); } catch { /* going away anyway */ }
  }
  async stats() { return this.engine?.status ? this.engine.status() : null; }
}
function threadsOf(engine) { try { return engine?.status?.().threads ?? null; } catch { return null; } }

/**
 * supports(manifest, env): {ok:false, reason, detail} only for a REAL prerequisite, with a reason from REASON_CODES. The engine itself needs neither OPFS (its cache is the Cache API and
 * it works without one) nor cross-origin isolation (it uses up to four threads only on an isolated page, else one), so the manifest says neither and a device is not refused for lacking them.
 * A manifest that DOES declare one of them is checked here as well, so this adapter never says yes to a manifest it cannot honour.
 */
export function kokoroSupports(manifest, env = {}) {
  const view = manifest?.view ?? manifest ?? {};
  const files = engineFilesOf(manifest?.descriptor ? manifest : null);
  if (manifest?.descriptor && (!files || !KOKORO_ENGINE_ROLES.every((r) => files.some((f) => f.role === r)))) return { ok: false, reason: "manifest-invalid", detail: { why: "the file list lacks an engine role" } };
  const needs = view.needs ?? {};
  if (needs.crossOriginIsolated && !env.crossOriginIsolated) return { ok: false, reason: "needs-cross-origin-isolation" };
  if (needs.threads && !env.crossOriginIsolated) return { ok: false, reason: "needs-threads" };
  if (needs.opfs && env.opfs === false) return { ok: false, reason: "needs-opfs" };
  return { ok: true };
}

/** Register the engine "kokoro" (kind speech-synthesis, group speech-out, operation synthesize) on `registry`. `createEngine({workerUrl})` returns the engine; `manifest` gives the default file list. */
export function registerKokoro(registry, { createEngine, manifest = null } = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("registerKokoro: a registry is required");
  if (typeof createEngine !== "function") throw new TypeError("registerKokoro: createEngine is required");
  return registry.register("kokoro", {
    kind: "speech-synthesis", group: "speech-out", ops: ["synthesize"],
    createAdapter: () => new KokoroAdapter({ createEngine, manifest }),
    supports: kokoroSupports,
    engineVersions: ["kokoro-engine-files/1"],
    license: "AGPL-3.0-only",
    licenseNote: "This adapter is AGPL-3.0-only. The phonemizer (eSpeak NG, GPL-3.0-or-later) is inside the engine's own module worker, a separate artifact the consumer hosts and notices; a consumer that does not register this entry never inherits it. The model is Apache-2.0."
  });
}
