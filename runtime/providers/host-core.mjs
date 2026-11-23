// Provider host core: the part that lives INSIDE the inference Worker.
// Provenance: productionised from spikes/llm/provider/host-core.js (FAB-02, same state machine and event guarantees).
// Changes for production (FAB-07p): typed errors with a contract `class` and plain advice (errors.mjs); load attempts numbered by
// the caller; a WebGPU preflight; storage operations (inspect / install / verify / delete) that work without loading the model;
// an unknown structured mode is refused loudly instead of treated as text; the Worker's liveness lock name is announced.
//
// It owns one engine adapter, serialises generate() calls (FIFO + priority), turns an adapter's raw stream into attempt events,
// and guarantees:
//   * exactly one terminal event per attemptId (attempt-completed | attempt-failed | attempt-aborted), nothing after it
//   * strictly increasing `seq` per attempt
//   * failure is loud: adapter errors become attempt-failed with phase/code/class/advice/partialText; a provider fault moves the
//     provider to state "faulted", announced to every port
//   * NO automatic retry, NO fallback to another model. A retry is a NEW generate() with a NEW attemptId (and retryOf);
//     a new load() is a NEW load attempt
// No time limit exists anywhere (ADR-0001). Nothing on the token path is a native async generator (Safari 27.0 crash, see
// spikes/llm/RESULTS.md): adapters push parts through a callback.
import { judgeStructured } from "./structured.mjs";
import { classifyEngineError, parseOverflow, serializeError, estimateTokens, ERROR_CLASSES } from "./errors.mjs";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const KNOWN_FORMATS = new Set(["text", "json_object", "json_schema"]);

/**
 * adapters: { [name]: () => Adapter }        engine factories (lazy)
 * storage:  { [name]: { inspect, install, verify, remove } }   per-engine cache operations that need no loaded model
 * livenessLock: string | null                 announced to clients; the entry script holds that Web Lock for the Worker's life
 * hooks (all optional; they only ADD to the built-in behaviour, never weaken a built-in refusal):
 *   validateRequest(request) -> null | {code, class, message}   a consumer's request rule, run BEFORE the built-in checks (for example maxTokens required)
 *   errorClasses: string[]                                       extra error classes the consumer may report
 *   classifyError(err, {phase}, base) -> fields | undefined      may replace the built-in classification (see errors.mjs)
 *   afterGenerate({text, finishReason, responseFormat, judged, usage, request}) -> undefined | {error:{code, class, message, advice?, retryable?}}
 *                                                                runs before the terminal event, also when the structured result is invalid
 *   structuredFormats: string[]                                  extra responseFormat.type values accepted (judged by the consumer's hook)
 *   validateRequestStage: "first" (default) | "after-messages"  where validateRequest runs: before every built-in check, or after the messages checks and before maxTokens and the format checks
 * diagnostics: true (default) | false   false drops the debug objects an adapter emits (the adapters' debug blocks are switched by the same flag: the host forces their knobs off when it is false; a release artifact has them removed)
 */
export function createHost({ adapters, storage = {}, providerId = "provider", livenessLock = null, hooks = {}, diagnostics = true, credentialTimeoutMs = 30000 }) {
  const knownFormats = new Set([...KNOWN_FORMATS, ...(hooks.structuredFormats || [])]);
  const errorClasses = new Set(hooks.errorClasses || []);
  let adapter = null;
  let adapterName = null;
  let loadedInfo = null;
  let loadedConfig = null;
  let loadAttempts = 0;
  let state = "unloaded"; // unloaded | loading | ready | faulted | unloading
  let stateDetail = null;
  const queue = [];
  let running = null;
  const attempts = new Map();
  const jobs = new Map(); // storage jobs: id -> AbortController
  const counters = { received: 0, completed: 0, failed: 0, aborted: 0, tokens: 0, recoveries: 0 };

  const ports = new Set();
  const send = (p, msg, transfer) => (transfer && transfer.length ? p.postMessage(msg, transfer) : p.postMessage(msg));
  const broadcast = (msg) => { for (const p of ports) p.postMessage(msg); };
  const setState = (s, detail = null) => { state = s; stateDetail = detail; broadcast({ type: "provider-state", state: s, detail, at: Date.now() }); };

  // ---- load ------------------------------------------------------------------------------------------------------
  // the diagnostics switch reaches the adapters through the load config: with it off, their debug knobs are forced off whatever a catalogue or caller asked for
  const withDiagnostics = (c) => (diagnostics || !c?.knobs ? c : { ...c, knobs: Object.fromEntries(Object.entries(c.knobs).map(([k, v]) => [k, k.startsWith("dev") && k.includes("Diagnostics") ? false : v])) });   // every dev*Diagnostics* knob (named by pattern so a release build carries no debug name)
  async function onLoad(port, id, config) {
    config = withDiagnostics(config);
    if (state === "loading" || state === "unloading") return send(port, { id, type: "error", error: { name: "ProviderBusy", code: "provider-busy", class: "provider-unavailable", message: `cannot load while ${state}` } });
    if (running) return send(port, { id, type: "error", error: { name: "ProviderBusy", code: "provider-busy", class: "provider-unavailable", message: "cannot load while an attempt is running; unload first" } });
    const loadAttempt = Number.isInteger(config.loadAttempt) ? config.loadAttempt : ++loadAttempts;
    loadAttempts = Math.max(loadAttempts, loadAttempt);
    try {
      if (adapter) { try { await adapter.unload(); } catch { /* replaced anyway */ } adapter = null; }
      const factory = adapters[config.adapter];
      if (!factory) throw Object.assign(new Error(`unknown adapter ${config.adapter}`), { name: "ConfigError" });
      setState("loading", { adapter: config.adapter, loadAttempt });
      adapter = factory();
      adapterName = config.adapter;
      const t0 = now();
      await adapter.preflight?.(config);
      const info = await adapter.load(config, { onProgress: (p) => send(port, { id, type: "progress", progress: p }) });
      loadedInfo = info; loadedConfig = config; setState("ready", { modelId: info?.modelId || null, loadAttempt });
      send(port, { id, type: "result", value: { providerId, adapter: adapterName, loadAttempt, loadMs: Math.round(now() - t0), ...info } });
    } catch (err) {
      try { await adapter?.unload?.(); } catch { /* the load failed already; the original error is the one to report */ }
      adapter = null; loadedInfo = null; loadedConfig = null;
      const c = classifyEngineError(err, { phase: "load" }, hooks);
      const typed = err?.typed ? { ...c, ...err.typed } : c;
      setState("faulted", { phase: "load", loadAttempt, class: typed.class, code: typed.code, message: typed.message.slice(0, 300) });
      // Nothing retries here. Calling load() again is a NEW load attempt (the caller supplies the next number).
      send(port, { id, type: "error", error: { ...serializeError(err), message: typed.message, code: typed.code, class: typed.class, reason: typed.reason, advice: typed.advice, phase: "load", loadAttempt, retryable: true, ...(err?.detail ? { detail: err.detail } : {}) } });
    }
  }

  // ---- generate --------------------------------------------------------------------------------------------------
  function enqueue(port, id, request) {
    counters.received++;
    const attempt = {
      port, id, request, attemptId: request?.attemptId, seq: 0, receivedAt: now(), receivedEpoch: Date.now(),
      controller: new AbortController(), terminal: false, text: "", tokenTimes: [], firstTokenAt: null, startedAt: null, usage: null, abort: null
    };
    if (!request || typeof request.attemptId !== "string" || !request.attemptId) {
      return send(port, { id, type: "error", error: { name: "TypeError", class: "invalid-request", message: "generate(request): request.attemptId (string) is required; the caller mints attempt ids" } });
    }
    if (attempts.has(attempt.attemptId)) {
      return send(port, { id, type: "error", error: { name: "DuplicateAttempt", class: "invalid-request", message: `attemptId ${attempt.attemptId} already in flight; a retry needs a new attemptId` } });
    }
    attempts.set(attempt.attemptId, attempt);
    const bad = validateRequest(request);
    if (bad) { emit(attempt, "attempt-queued", { position: 0 }); return finish(attempt, "attempt-failed", { error: { code: bad.code, class: bad.class, message: bad.message, phase: "request", retryable: false } }); }
    if (state !== "ready") {
      emit(attempt, "attempt-queued", { position: 0 });
      return finish(attempt, "attempt-failed", { error: { code: state === "faulted" ? "provider-faulted" : "provider-not-ready", class: "provider-unavailable", message: `provider state is ${state}${stateDetail?.message ? `: ${stateDetail.message}` : ""}`, phase: "queued", retryable: state !== "faulted", detail: stateDetail, advice: state === "faulted" ? "The model is faulted. Open Settings > Models and load it again (a new load attempt)." : "The model is not loaded. Open Settings > Models." } });
    }
    queue.push(attempt);
    queue.sort((a, b) => (b.request.priority || 0) - (a.request.priority || 0) || a.receivedAt - b.receivedAt);
    emit(attempt, "attempt-queued", { position: queue.indexOf(attempt) + (running ? 1 : 0) });
    pump();
  }

  function validateRequest(r) {
    // The consumer's rule runs FIRST by default, with its own text and order (validateRequestStage "after-messages" runs it after the messages checks instead); when it finds nothing
    // the built-in checks still run, so a hook can add a refusal but never remove one.
    const ownRule = () => {
      if (typeof hooks.validateRequest !== "function") return null;
      let own; try { own = hooks.validateRequest(r); } catch (e) { own = { code: "request-hook-failed", class: "invalid-request", message: String(e?.message || e) }; }
      if (!own) return null;
      const cls = ERROR_CLASSES.includes(own.class) || errorClasses.has(own.class) ? own.class : "invalid-request";
      return { code: String(own.code || "bad-request"), class: cls, message: String(own.message || "the request was refused by the consumer's validation") };
    };
    const afterMessages = hooks.validateRequestStage === "after-messages";
    if (!afterMessages) { const p = ownRule(); if (p) return p; }
    if (!Array.isArray(r.messages) || r.messages.length === 0) return { code: "bad-request", class: "invalid-request", message: "messages[] required" };
    if (!r.messages.every((m) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string")) return { code: "bad-request", class: "invalid-request", message: "messages must be {role, content:string}" };
    if (afterMessages) { const p = ownRule(); if (p) return p; }
    if (r.maxTokens !== undefined && (!Number.isInteger(r.maxTokens) || r.maxTokens < 1)) return { code: "bad-request", class: "invalid-request", message: "maxTokens must be a positive integer when given; omit it for no limit" };
    const t = r.responseFormat?.type;
    if (t !== undefined && !knownFormats.has(t)) return { code: "unsupported-structured-mode", class: "unsupported", message: `responseFormat.type ${JSON.stringify(t)} is not supported; use text, json_object or json_schema` };
    if (t === "json_schema" && (!r.responseFormat.schema || typeof r.responseFormat.schema !== "object")) return { code: "bad-request", class: "invalid-request", message: "responseFormat json_schema needs a schema object" };
    return null;
  }

  function emit(attempt, type, data = {}) {
    if (attempt.terminal) return;
    const event = { type, attemptId: attempt.attemptId, retryOf: attempt.request.retryOf ?? null, activityId: attempt.request.activityId ?? null, mindId: attempt.request.mindId ?? null, seq: attempt.seq++, at: Date.now(), tMs: Math.round((now() - attempt.receivedAt) * 100) / 100, ...data };
    send(attempt.port, { id: attempt.id, type: "event", event });
  }

  function finish(attempt, type, data) {
    if (attempt.terminal) return;
    emit(attempt, type, data);
    attempt.terminal = true;
    attempts.delete(attempt.attemptId);
    if (type === "attempt-completed") counters.completed++; else if (type === "attempt-failed") counters.failed++; else counters.aborted++;
    send(attempt.port, { id: attempt.id, type: "done" });
  }

  // An abort carries WHO and WHY. Only a deliberate cancel (by mind | human | supervisor) is a cancellation; anything else is
  // reported with deliberate:false so the mind-side adapter can treat it as a defect (contract-violation).
  function normalizeAbort(reason) {
    if (reason && typeof reason === "object") { const by = typeof reason.by === "string" ? reason.by : null; return { reason: String(reason.reason ?? reason.message ?? "aborted"), by, deliberate: ["mind", "human", "supervisor"].includes(by) }; }
    return { reason: String(reason ?? "caller-abort"), by: null, deliberate: false };
  }
  function abortAttempt(attemptId, reason = "caller-abort") {
    const attempt = attempts.get(attemptId);
    if (!attempt || attempt.terminal) return false;
    attempt.abort = normalizeAbort(reason);
    const qi = queue.indexOf(attempt);
    if (qi >= 0) { queue.splice(qi, 1); finish(attempt, "attempt-aborted", { ...attempt.abort, partialText: "", phase: "queued" }); return true; }
    attempt.controller.abort(attempt.abort.reason);
    return true;
  }

  // A fault whose cure is a fresh load of what was loaded (an engine object disposed under it): the host does that itself, as a NEW load attempt that is announced
  // (faulted -> loading -> ready) and counted. Attempts waiting in the queue go on afterwards; the attempt that hit the fault is not retried. If the reload fails the
  // host stays faulted with that reason, and a person (or the caller) loads again explicitly.
  let recovering = false;
  async function recover(cause) {
    if (recovering || !loadedConfig || !adapters[loadedConfig.adapter]) return;
    recovering = true;
    try {
      while (running) await new Promise((resolve) => setTimeout(resolve, 5));
      const config = { ...loadedConfig, loadAttempt: ++loadAttempts };
      try { await adapter?.unload?.(); } catch { /* it is being replaced because it is broken */ }
      adapter = adapters[config.adapter]();
      adapterName = config.adapter;
      setState("loading", { adapter: config.adapter, loadAttempt: config.loadAttempt, recovering: true, because: cause.code });
      await adapter.preflight?.(config);
      const info = await adapter.load(config, { onProgress: () => {} });
      loadedInfo = info; loadedConfig = config; counters.recoveries++;
      setState("ready", { modelId: info?.modelId || null, loadAttempt: config.loadAttempt, recovered: true, because: cause.code });
    } catch (err) {
      try { await adapter?.unload?.(); } catch { /* already failed */ }
      adapter = null; loadedInfo = null;
      const c2 = classifyEngineError(err, { phase: "load" }, hooks);
      setState("faulted", { phase: "load", recovering: true, class: c2.class, code: c2.code, message: c2.message.slice(0, 300) });
    } finally {
      recovering = false;
      setTimeout(pump, 0);
    }
  }

  async function pump() {
    if (running || queue.length === 0 || state !== "ready") return;
    const attempt = queue.shift();
    running = attempt;
    try { await runAttempt(attempt); } finally { running = null; setTimeout(pump, 0); }
  }

  async function runAttempt(attempt) {
    const r = attempt.request;
    attempt.startedAt = now();
    emit(attempt, "attempt-started", { providerId, adapter: adapterName, modelId: loadedInfo?.modelId ?? null, queueMs: Math.round(attempt.startedAt - attempt.receivedAt), request: summarizeRequest(r) });
    let index = 0; let finishReason = null;
    try {
      const onPart = (part) => {
        /* DEV_DIAGNOSTICS_START */
        if(diagnostics&&part.diagnostic){emit(attempt,'debug-object',part.diagnostic);return;}
        /* DEV_DIAGNOSTICS_END */
        if (attempt.controller.signal.aborted) return;
        if (part.delta) {
          const t = now();
          if (attempt.firstTokenAt === null) {
            attempt.firstTokenAt = t;
            emit(attempt, "first-token", { ttftMs: Math.round((t - attempt.startedAt) * 100) / 100 });
          }
          attempt.text += part.delta; attempt.tokenTimes.push(Math.round((t - attempt.startedAt) * 100) / 100); counters.tokens++;
          emit(attempt, "token", { index: index++, text: part.delta });
        }
        if (part.usage) attempt.usage = { ...(attempt.usage || {}), ...part.usage };
        if (part.finish) finishReason = part.finish;
      };
      await adapter.run({ ...r, sampling: { temperature: 0, topP: 1, ...(r.sampling || {}) }, cachePrompt: r.cachePrompt !== false }, attempt.controller.signal, onPart);
      if (attempt.controller.signal.aborted) {
        return finish(attempt, "attempt-aborted", { ...(attempt.abort || normalizeAbort(String(attempt.controller.signal.reason || "aborted"))), partialText: attempt.text, phase: attempt.firstTokenAt === null ? "prefill" : "decode", usage: usageOf(attempt, index) });
      }
      const usage = usageOf(attempt, index);
      const structured = judgeStructured(attempt.text, r.responseFormat);
      if (structured) structured.enforcement = loadedInfo?.capabilities?.structuredEnforcement?.[r.responseFormat.type] ?? "validated";
      if (typeof hooks.afterGenerate === "function") {
        let own; let hookFailure = null;
        try { own = hooks.afterGenerate({ text: attempt.text, finishReason: finishReason || "stop", responseFormat: r.responseFormat ?? null, judged: structured, usage, request: r }); } catch (e) { hookFailure = e; }
        if (hookFailure) return finish(attempt, "attempt-failed", { error: { code: "after-generate-hook-failed", class: "runtime-fault", message: String(hookFailure?.message || hookFailure).slice(0, 300), phase: "structured", retryable: false }, partialText: attempt.text, usage, structured });
        if (own?.error) {
          const cls = ERROR_CLASSES.includes(own.error.class) || errorClasses.has(own.error.class) ? own.error.class : "output-invalid";
          return finish(attempt, "attempt-failed", { error: { code: String(own.error.code || "after-generate"), class: cls, message: String(own.error.message || "the reply was refused by the consumer"), phase: "structured", retryable: own.error.retryable ?? true, ...(own.error.advice ? { advice: own.error.advice } : {}) }, partialText: attempt.text, usage, structured });
        }
      }
      if (structured && !structured.valid) {
        // The text was generated but the requested structure was not met: a failed attempt, loudly, raw text preserved, nothing repaired.
        return finish(attempt, "attempt-failed", { error: { code: "structured-output-invalid", class: "output-invalid", message: `${structured.stage}: ${structured.error || structured.errors.join("; ")}`, phase: "structured", retryable: true, advice: "The model's reply did not match the requested structure. The raw reply is kept. The mind may retry as a new attempt." }, partialText: attempt.text, usage, structured });
      }
      return finish(attempt, "attempt-completed", { finishReason: finishReason || "stop", text: attempt.text, usage, structured });
    } catch (err) {
      if (attempt.controller.signal.aborted || err?.name === "AbortError" || err?.name === "WllamaAbortError") {
        return finish(attempt, "attempt-aborted", { ...(attempt.abort || normalizeAbort("aborted")), partialText: attempt.text, phase: attempt.firstTokenAt === null ? "prefill" : "decode", usage: usageOf(attempt, index) });
      }
      const message = String(err?.message || err);
      const overflow = parseOverflow(message, err);
      if (overflow) {
        return finish(attempt, "attempt-failed", { error: { code: "context-overflow", class: "context-overflow", name: err?.name || "Error", message: message.slice(0, 300), phase: "prefill", retryable: false, providerFault: false, detail: overflow }, partialText: "", usage: usageOf(attempt, index) });
      }
      const c = classifyEngineError(err, { phase: "generate" }, hooks);
      // Any unrecognised exception from the engine mid-generation is treated as a provider fault: the engine state is unknown.
      if (c.providerFault) {
        setState("faulted", { phase: "generate", class: c.class, code: c.code, message: c.message.slice(0, 300) });
        if (c.recoverable) setTimeout(() => { void recover(c); }, 0); // the host follows its own fault: a fresh load of the same model, announced and counted
      }
      return finish(attempt, "attempt-failed", { error: { code: c.code, class: c.class, reason: c.reason, name: c.name, message: message.slice(0, 600), advice: c.advice, phase: attempt.firstTokenAt === null ? "prefill" : "decode", retryable: !c.providerFault, providerFault: c.providerFault, stack: String(err?.stack || "").slice(0, 700) }, partialText: attempt.text, usage: usageOf(attempt, index) });
    }
  }

  function usageOf(attempt, chunks) {
    const u = attempt.usage || {};
    const end = attempt.tokenTimes.length ? attempt.tokenTimes[attempt.tokenTimes.length - 1] : null;
    const start = attempt.tokenTimes.length ? attempt.tokenTimes[0] : null;
    const completionTokens = Number.isInteger(u.completionTokens) ? u.completionTokens : chunks;
    const decodeMs = end !== null && start !== null ? end - start : null;
    return {
      promptTokens: u.promptTokens ?? null, cachedPromptTokens: u.cachedPromptTokens ?? null, completionTokens, streamedChunks: chunks,
      engineTimings: u.engineTimings ?? null, nativeTiming: u.nativeTiming ?? null, nativeDiagnostics: u.nativeDiagnostics ?? null,
      ttftMs: attempt.firstTokenAt === null ? null : Math.round((attempt.firstTokenAt - attempt.startedAt) * 100) / 100,
      totalMs: Math.round((now() - attempt.startedAt) * 100) / 100,
      decodeTokensPerSec: decodeMs && decodeMs > 0 && completionTokens > 1 ? Math.round(((completionTokens - 1) / (decodeMs / 1000)) * 100) / 100 : null,
      tokenTimesMs: attempt.tokenTimes
    };
  }

  function summarizeRequest(r) {
    return { messages: r.messages.length, maxTokens: r.maxTokens ?? null, sampling: r.sampling || null, responseFormat: r.responseFormat?.type || "text", cachePrompt: r.cachePrompt !== false, thinking: r.thinking === true };
  }

  // Shaped like contracts/fabric/schemas/provider/provider-capabilities.schema.json (fabric-provider-capabilities/1).
  // `structuredOutput` lists only modes the engine ENFORCES while decoding; a post-validated mode is reported in
  // stats().structuredValidated (and in every result's `structured.enforcement`), never advertised as enforced.
  function capabilities() {
    const c = loadedInfo?.capabilities || {};
    return {
      format: "fabric-provider-capabilities/1", providerId, kind: c.kind || "local-webgpu",
      model: { id: loadedInfo?.modelId ?? "none-loaded", ...(c.revision ? { revision: c.revision } : {}), ...(c.quantization ? { quantization: c.quantization } : {}), ...(c.license ? { license: c.license } : {}) },
      runtime: { name: c.runtimeName || loadedInfo?.runtime || "none", version: c.runtimeVersion || "unknown", crossOriginIsolated: typeof self !== "undefined" ? Boolean(self.crossOriginIsolated) : false },
      contextWindowTokens: c.contextWindowTokens ?? loadedInfo?.context?.n_ctx ?? loadedInfo?.context?.contextWindow ?? 4096,
      maxOutputTokens: c.maxOutputTokens ?? 1024,
      streaming: true,
      structuredOutput: c.structuredEnforced ?? [],
      tokenCounting: "estimated",
      concurrency: { maxConcurrentGenerations: 1, preemption: "none" },
      determinism: { supportsSeed: true, greedyAvailable: true }
    };
  }

  // ---- unload ----------------------------------------------------------------------------------------------------
  async function onUnload(port, id) {
    setState("unloading");
    for (const a of [...queue]) abortAttempt(a.attemptId, { by: "supervisor", reason: "provider-unload" });
    if (running) abortAttempt(running.attemptId, { by: "supervisor", reason: "provider-unload" });
    try { const cleanup=await adapter?.unload(); adapter = null; loadedInfo = null; loadedConfig = null; setState("unloaded"); send(port, { id, type: "result", value: { unloaded: true, ...(cleanup?{cleanup}:{}) } }); }
    catch (err) { setState("faulted", { phase: "unload", message: String(err?.message || err) }); send(port, { id, type: "error", error: { ...serializeError(err), class: "runtime-fault" } }); }
  }

  // ---- storage operations (no model needs to be loaded) --------------------------------------------------------------
  // a storage job may need a credential for a source: it asks the page over this port, waits (with a timeout), and keeps nothing; the answer is never put in state, logs or errors
  const credentialWaits = new Map();
  const requestCredentialOver = (port, jobId, timeoutMs = credentialTimeoutMs) => (endpoint) => new Promise((resolve) => {
    const rid = `credential-${globalThis.crypto.randomUUID()}`;   // unguessable, and only the port that was asked may answer
    const timer = setTimeout(() => { credentialWaits.delete(rid); resolve({ refused: true, timedOut: true }); }, timeoutMs);
    credentialWaits.set(rid, { port, resolve: (a) => { clearTimeout(timer); credentialWaits.delete(rid); resolve(a); } });
    send(port, { type: "credential-request", id: rid, job: jobId, endpoint });
  });
  async function onStorage(port, id, m) {
    const ops = storage[m.engine];
    const fn = ops?.[m.action];
    if (typeof fn !== "function") return send(port, { id, type: "error", error: { name: "TypeError", class: "invalid-request", message: `no storage action ${m.engine}.${m.action}` } });
    const mutating = m.action === "install" || m.action === "remove" || m.action === "repair";
    const sameModelLoaded = adapter && (state === "ready" || state === "loading") && loadedConfig?.adapter === m.engine && (m.action === "remove" || m.action === "repair");
    if (sameModelLoaded) return send(port, { id, type: "error", error: { name: "ProviderBusy", code: "provider-busy", class: "provider-unavailable", message: `cannot ${m.action} the files of a model that is ${state}; unload it first` } });
    const controller = new AbortController(); jobs.set(id, controller);
    try {
      const value = await fn(m.args || {}, { onProgress: (p) => send(port, { id, type: "progress", progress: p }), signal: controller.signal, requestCredential: requestCredentialOver(port, id) });
      send(port, { id, type: "result", value });
    } catch (err) {
      if (controller.signal.aborted) return send(port, { id, type: "error", error: { name: "AbortError", class: "aborted", code: "storage-cancelled", message: `${m.action} cancelled`, detail: err?.detail } });
      const c = classifyEngineError(err, { phase: "install" }, hooks);
      send(port, { id, type: "error", error: { ...serializeError(err), message: c.message, code: err?.code || c.code, class: c.class, reason: c.reason, advice: c.advice, phase: mutating ? "install" : "inspect", ...(err?.detail ? { detail: err.detail } : {}) } });
    } finally { jobs.delete(id); }
  }

  // ---- other engine families (speech, recognition, embeddings, image) ---------------------------------------------
  // The text engine above is one loaded model at a time. A family is loaded SIDE BY SIDE ("engine-load"), then invoked by operation
  // name ("invoke"). The guarantees match generate(): the caller mints `invocationId`, exactly one terminal event per invocation
  // (invoke-completed | invoke-failed | invoke-aborted), strictly increasing seq, no retry, no fallback. Invocations of one engine run
  // in order (an engine is one instance); different engines run side by side. The typed request and result of each operation are
  // the family's business, not this host's.
  const families = new Map();      // engine -> { adapter, info, config, chain }
  const invocations = new Map();   // invocationId -> invocation

  async function onEngineLoad(port, id, m) {
    const engine = m.engine; const factory = typeof engine === "string" ? adapters[engine] : null;
    if (!factory) return send(port, { id, type: "error", error: { name: "ConfigError", class: "invalid-request", code: "unknown-engine", message: `unknown engine ${String(engine)}` } });
    if (engine === adapterName && adapter) return send(port, { id, type: "error", error: { name: "ConfigError", class: "invalid-request", code: "engine-is-text-engine", message: `${engine} is the loaded text engine; use load, not engine-load` } });
    const config = withDiagnostics({ ...(m.config || {}), adapter: engine });
    const steady = Number.isFinite(m.needs?.steadyBytes) ? m.needs.steadyBytes : 0;
    if (Number.isFinite(m.maxBytes)) {
      const others = [...families.entries()].filter(([name]) => name !== engine).reduce((n, [, f]) => n + (f.needs?.steadyBytes || 0), 0);
      const declared = others + (Number.isFinite(m.usedBytes) ? m.usedBytes : 0) + steady;
      if (declared > m.maxBytes) return send(port, { id, type: "error", error: { name: "BudgetError", class: "out-of-memory", code: "memory-over-budget", reason: "memory-over-budget", message: `loading ${engine} would hold about ${declared} bytes, over the ${m.maxBytes} the consumer allows`, advice: "Unload another model first, or choose a smaller one. Nothing was unloaded for you.", phase: "load", retryable: true, detail: { declaredBytes: declared, maxBytes: m.maxBytes, engine } } });
    }
    const previous = families.get(engine);
    if (previous) { try { await previous.adapter.unload?.(); } catch { /* replaced anyway */ } families.delete(engine); }
    let instance = null;
    try {
      instance = factory();
      await instance.preflight?.(config);
      const info = await instance.load(config, { onProgress: (p) => send(port, { id, type: "progress", progress: p }) });
      families.set(engine, { adapter: instance, info, config, needs: m.needs || null, chain: Promise.resolve(), ahead: 0 });
      broadcast({ type: "engine-state", engine, state: "ready", at: Date.now() });
      send(port, { id, type: "result", value: { engine, ...info } });
    } catch (err) {
      try { await instance?.unload?.(); } catch { /* the load failed already */ }
      const c = classifyEngineError(err, { phase: "load" }, hooks);
      broadcast({ type: "engine-state", engine, state: "faulted", detail: { class: c.class, code: c.code, message: c.message.slice(0, 300) }, at: Date.now() });
      send(port, { id, type: "error", error: { ...serializeError(err), message: c.message, code: c.code, class: c.class, reason: c.reason, advice: c.advice, phase: "load", retryable: true } });
    }
  }

  async function onEngineUnload(port, id, m) {
    const f = families.get(m.engine);
    if (!f) return send(port, { id, type: "result", value: { unloaded: false, engine: m.engine } });
    for (const inv of [...invocations.values()]) if (inv.engine === m.engine) abortInvocation(inv.invocationId, { by: "supervisor", reason: "engine-unload" });
    try { await f.adapter.unload?.(); families.delete(m.engine); broadcast({ type: "engine-state", engine: m.engine, state: "unloaded", at: Date.now() }); send(port, { id, type: "result", value: { unloaded: true, engine: m.engine } }); }
    catch (err) { families.delete(m.engine); broadcast({ type: "engine-state", engine: m.engine, state: "faulted", detail: { phase: "unload", message: String(err?.message || err) }, at: Date.now() }); send(port, { id, type: "error", error: { ...serializeError(err), class: "runtime-fault" } }); }
  }

  function emitInv(inv, type, data = {}, transfer = null) {
    if (inv.terminal) return;
    send(inv.port, { id: inv.id, type: "event", event: { type, invocationId: inv.invocationId, engine: inv.engine, name: inv.name, seq: inv.seq++, at: Date.now(), tMs: Math.round((now() - inv.receivedAt) * 100) / 100, ...data } }, transfer);
  }
  function finishInv(inv, type, data) {
    if (inv.terminal) return;
    emitInv(inv, type, data); inv.terminal = true; invocations.delete(inv.invocationId);
    if (inv.fam) { inv.fam.ahead = Math.max(0, inv.fam.ahead - 1); inv.fam = null; }
    if (type === "invoke-completed") counters.completed++; else if (type === "invoke-failed") counters.failed++; else counters.aborted++;
    send(inv.port, { id: inv.id, type: "done" });
  }

  function onInvoke(port, id, m) {
    const request = m.request && typeof m.request === "object" ? m.request : {};
    if (typeof request.invocationId !== "string" || !request.invocationId) return send(port, { id, type: "error", error: { name: "TypeError", class: "invalid-request", message: "invoke(request): request.invocationId (string) is required; the caller mints invocation ids" } });
    if (invocations.has(request.invocationId)) return send(port, { id, type: "error", error: { name: "DuplicateInvocation", class: "invalid-request", message: `invocationId ${request.invocationId} already in flight; a retry needs a new invocationId` } });
    const inv = { port, id, engine: m.engine, name: String(m.name ?? ""), invocationId: request.invocationId, request, seq: 0, terminal: false, controller: new AbortController(), abort: null, receivedAt: now(), started: false };
    invocations.set(inv.invocationId, inv); counters.received++;
    const fam = families.get(m.engine);
    const refuse = !fam ? { code: "engine-not-loaded", class: "provider-unavailable", message: `engine ${String(m.engine)} is not loaded; engine-load it first`, retryable: true }
      : typeof fam.adapter.invoke !== "function" ? { code: "engine-cannot-invoke", class: "unsupported", message: `engine ${m.engine} has no invoke operation`, retryable: false }
      : null;
    if (refuse) { emitInv(inv, "invoke-queued", { position: 0 }); return finishInv(inv, "invoke-failed", { error: { ...refuse, phase: "queued" } }); }
    // the real queue position: how many invocations of this engine are ahead (running or waiting)
    emitInv(inv, "invoke-queued", { position: fam.ahead });
    fam.ahead++; inv.fam = fam;
    fam.chain = fam.chain.then(() => runInvocation(inv, fam)).catch(() => {});
  }

  async function runInvocation(inv, fam) {
    if (inv.terminal) return;   // aborted while queued
    inv.started = true; emitInv(inv, "invoke-started", {});
    // a streamed partial result (an audio chunk, an image tile); `transfer` moves its buffers without copying them
    const part = (p, transfer) => { if (!inv.controller.signal.aborted) emitInv(inv, "invoke-part", { part: p }, transfer); };
    try {
      const result = await fam.adapter.invoke(inv.name, inv.request, inv.controller.signal, part);
      if (inv.controller.signal.aborted) return finishInv(inv, "invoke-aborted", { ...(inv.abort || normalizeAbort("aborted")), phase: "invoke" });
      return finishInv(inv, "invoke-completed", { result: result ?? null });
    } catch (err) {
      if (inv.controller.signal.aborted || err?.name === "AbortError") return finishInv(inv, "invoke-aborted", { ...(inv.abort || normalizeAbort("aborted")), phase: "invoke" });
      const c = classifyEngineError(err, { phase: "generate" }, hooks);
      if (c.providerFault) broadcast({ type: "engine-state", engine: inv.engine, state: "faulted", detail: { class: c.class, code: c.code, message: c.message.slice(0, 300) }, at: Date.now() });
      return finishInv(inv, "invoke-failed", { error: { code: c.code, class: c.class, reason: c.reason, message: String(err?.message || err).slice(0, 600), advice: c.advice, phase: "invoke", retryable: !c.providerFault, providerFault: c.providerFault } });
    }
  }

  function abortInvocation(invocationId, reason = "caller-abort") {
    const inv = invocations.get(invocationId);
    if (!inv || inv.terminal) return false;
    inv.abort = normalizeAbort(reason);
    if (!inv.started) { finishInv(inv, "invoke-aborted", { ...inv.abort, phase: "queued" }); return true; }
    inv.controller.abort(inv.abort.reason);
    return true;
  }

  async function handle(port, m) {
    if (!m || typeof m !== "object") return;
    switch (m.op) {
      case "hello": return send(port, { id: m.id, type: "result", value: { providerId, adapters: Object.keys(adapters), state, livenessLock, families: [...families.keys()] } });
      case "engine-load": return onEngineLoad(port, m.id, m);
      case "engine-unload": return onEngineUnload(port, m.id, m);
      case "invoke": return onInvoke(port, m.id, m);
      case "load": return onLoad(port, m.id, m.config || {});
      case "generate": return enqueue(port, m.id, m.request);
      case "abort": { const hit = abortAttempt(m.target, m.reason || "caller-abort") || abortInvocation(m.target, m.reason || "caller-abort"); return send(port, { id: m.id, type: "result", value: { aborted: true, found: hit } }); }
      case "unload": return onUnload(port, m.id);
      case "capabilities": return send(port, { id: m.id, type: "result", value: capabilities() });
      case "storage": return onStorage(port, m.id, m);
      case "credential-response": { const w = credentialWaits.get(m.id); if (w && w.port === port) w.resolve(m.unavailable ? { unavailable: true } : m.refused ? { refused: true } : m.headers ? { headers: m.headers } : { none: true }); return; }   // an answer from any other port (a mind worker) is ignored
      case "storage-cancel": { const c = jobs.get(m.target); c?.abort(); return send(port, { id: m.id, type: "result", value: { cancelled: Boolean(c) } }); }
      case "count-tokens": {
        try { const r = adapter?.countTokens ? await adapter.countTokens(m.messages || []) : null; return send(port, { id: m.id, type: "result", value: r || estimateTokens(m.messages || []) }); }
        catch { return send(port, { id: m.id, type: "result", value: estimateTokens(m.messages || []) }); }
      }
      case "stats": {
        let eng = null; try { eng = adapter?.stats ? await adapter.stats() : null; } catch (err) { eng = { error: String(err?.message || err) }; }
        return send(port, { id: m.id, type: "result", value: { state, stateDetail, counters: { ...counters }, queued: queue.length, running: running?.attemptId || null, ports: ports.size, loadAttempts, structuredValidated: loadedInfo?.capabilities?.structuredValidated ?? [], engine: eng } });
      }
      default: return send(port, { id: m.id, type: "error", error: { name: "TypeError", class: "invalid-request", message: `unknown op ${m.op}` } });
    }
  }
  function attach(port) {
    ports.add(port);
    port.onmessage = (e) => handle(port, e.data);
    send(port, { type: "ready", providerId, adapters: Object.keys(adapters), state, livenessLock });
  }
  function detach(port) { ports.delete(port); }
  return { attach, detach };
}

export function serve(port, opts) { const host = createHost(opts); host.attach(port); return host; }
export { parseOverflow, serializeError } from "./errors.mjs";
