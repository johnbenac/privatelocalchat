// Provider client: what the page and every mind worker import to talk to the one inference host Worker.
// Provenance: productionised from spikes/llm/provider/client.js (FAB-02). Same wire protocol and call shapes; changes (FAB-07p):
//   * a crashed or killed host Worker is DETECTED (Web Lock held by the Worker for its whole life + the Worker error event) and
//     becomes a typed `runtime-fault` that keeps the raw message, for every in-flight attempt and every later call;
//   * protocol-level errors keep their contract `class` instead of being relabelled "bad-request";
//   * storage operations (inspect/install/verify/remove) are exposed, cancellable.
//
//   const provider = createProvider(worker | messagePort, { onProviderEvent });
//   await provider.ready();
//   await provider.load(config, { onProgress });         // rejects with an Error carrying class/code/reason/advice/loadAttempt
//   const call = provider.generate(request, { onToken, signal });
//   const terminal = await call.done;                    // NEVER rejects: failure is an attempt-failed event
//   call.abort({ by: "human", reason: "stop pressed" });
// No native async generators anywhere (Safari 27.0 crash); the iterator below is hand-written.
import { hostDiedError } from "./errors.mjs";

function abortReasonOf(r) {
  if (r && typeof r === "object" && typeof r.by === "string") return { by: r.by, reason: String(r.reason ?? r.message ?? "cancelled") };
  return String(r?.message || r || "caller-abort");
}

const TERMINAL = /^attempt-(completed|failed|aborted)$/;
const INV_TERMINAL = /^invoke-(completed|failed|aborted)$/;

function typedError(fields) {
  const err = new Error(fields.message);
  return Object.assign(err, fields);
}

export function createProvider(target, { onProviderEvent, diagnostics = true, credentials = null } = {}) {
  let nextId = 1;
  const pending = new Map();   // id -> { resolve, reject, onProgress, stream, kind }
  let readyResolve; let readyReject; const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => {}); // consumers that await ready() still see the rejection; this only prevents an unhandled-rejection report
  const listeners = new Set(onProviderEvent ? [onProviderEvent] : []);
  let dead = null;          // the typed fault once the host is gone
  let closed = false;       // terminate() was called by us: not a fault
  let lockNameSeen = null;
  let liveness = "unknown"; // "lock" | "unavailable" | "none-announced"
  let hostState = "unknown";

  const notify = (m) => listeners.forEach((fn) => { try { fn(m); } catch (e) { queueMicrotask(() => { throw e; }); } });

  function failStream(p, id, fault, how) {
    const s = p.stream; if (!s || s.ended) return;
    if (s.invoke) return s.forceTerminal({ type: "invoke-failed", invocationId: s.invocationId, seq: s.lastSeq + 1, at: Date.now(), tMs: null, error: { code: fault.code, class: fault.class, reason: fault.reason, name: fault.name, message: fault.message, advice: fault.advice, phase: "invoke", retryable: false, providerFault: true, how } });
    s.forceTerminal({
      type: "attempt-failed", attemptId: s.attemptId, retryOf: s.retryOf, activityId: s.activityId, mindId: s.mindId, seq: s.lastSeq + 1, at: Date.now(), tMs: null,
      error: { code: fault.code, class: fault.class, reason: fault.reason, name: fault.name, message: fault.message, advice: fault.advice, phase: s.firstToken ? "decode" : "prefill", retryable: false, providerFault: true, how },
      partialText: s.text, usage: null
    });
  }

  function hostDied(raw, how) {
    if (dead || closed) return;
    dead = hostDiedError(raw, { how });
    hostState = "faulted";
    readyReject(typedError({ ...dead, phase: "start" })); // a Worker that never became ready (script failed to load) rejects ready()
    const all = [...pending.entries()]; pending.clear();
    for (const [id, p] of all) {
      if (p.stream) failStream(p, id, dead, how);
      else p.reject(typedError({ ...dead, phase: p.kind }));
    }
    notify({ type: "provider-state", state: "faulted", detail: { phase: "host", class: dead.class, code: dead.code, message: dead.message, how }, at: Date.now() });
  }

  function watchLiveness(lockName) {
    lockNameSeen = lockName || null;
    if (!lockName) { liveness = "none-announced"; return; }
    if (typeof navigator === "undefined" || !navigator.locks?.request) {
      liveness = "unavailable";
      // Loud, not silent: without Web Locks a silently killed Worker cannot be told from a slow one.
      notify({ type: "liveness-unavailable", message: "navigator.locks is not available; a host Worker that dies without raising an error event will not be detected", at: Date.now() });
      return;
    }
    liveness = "lock";
    // The Worker holds this lock until it dies; the request is granted only then.
    navigator.locks.request(lockName, { mode: "exclusive" }, () => { hostDied("the inference host Worker released its liveness lock (it was terminated or crashed)", "liveness-lock"); }).catch((e) => {
      liveness = "unavailable";
      notify({ type: "liveness-unavailable", message: `liveness lock request failed: ${e?.message || e}`, at: Date.now() });
    });
  }

  target.onmessage = (e) => {
    const m = e.data; if (!m) return;
    /* DEV_DIAGNOSTICS_START */
    if(diagnostics&&m.type==='native-device-error'){notify(m);return;}
    /* DEV_DIAGNOSTICS_END */
    // the host Worker asks the PAGE for a credential for one endpoint: the answer is {headers}, {none} or {refused}; the token lives on the page and is handed over for that one request only
    if (m.type === "credential-request") {
      const reply = (a) => { try { target.postMessage({ op: "credential-response", id: m.id, ...a }); } catch { /* the host is gone */ } };
      Promise.resolve().then(() => (credentials ? credentials({ endpoint: m.endpoint }) : { unavailable: true })).then((a) => reply(a?.unavailable ? { unavailable: true } : a === "refused" || a?.refused ? { refused: true } : a?.headers && typeof a.headers === "object" ? { headers: a.headers } : { none: true }), () => reply({ refused: true }));
      return;
    }
    if (m.type === "ready") { hostState = m.state || "unloaded"; watchLiveness(m.livenessLock); return readyResolve(m); }
    if (m.type === "provider-state") { hostState = m.state; notify(m); return; }
    if (m.type === "engine-state") { notify(m); return; }
    const p = pending.get(m.id); if (!p) return;
    if (m.type === "progress") return p.onProgress?.(m.progress);
    if (m.type === "result") { pending.delete(m.id); return p.resolve(m.value); }
    if (m.type === "error") {
      pending.delete(m.id);
      const err = typedError({ ...m.error, message: m.error.message });
      if (p.stream) p.stream.fail(err);
      return p.reject(err);
    }
    if (m.type === "event") return p.stream.push(m.event);
    if (m.type === "done") { pending.delete(m.id); return p.stream.end(); }
  };
  target.onerror = (e) => {
    // The Worker's script threw (uncaught exception, failed import, crash). Raw message kept verbatim.
    e?.preventDefault?.();
    hostDied(`${e?.message || "worker error event"}${e?.filename ? ` (${e.filename}:${e.lineno ?? "?"})` : ""}`, "worker-error-event");
  };
  target.onmessageerror = (e) => hostDied(`message could not be deserialised: ${e?.message || e}`, "messageerror");

  const refuseIfDead = () => (dead ? typedError({ ...dead, phase: "call" }) : null);

  const call = (op, extra = {}, { onProgress, kind = op, transfer = null } = {}) => new Promise((resolve, reject) => {
    const d = refuseIfDead(); if (d) return reject(d);
    if (closed) return reject(typedError({ class: "provider-unavailable", code: "provider-closed", message: "the provider was closed", name: "ProviderClosed" }));
    const id = nextId++; pending.set(id, { resolve, reject, onProgress, kind });
    if (transfer?.length) target.postMessage({ id, op, ...extra }, transfer); else target.postMessage({ id, op, ...extra });
  });

  return {
    ready: () => ready,
    hello: () => call("hello"),
    load: (config, { onProgress } = {}) => call("load", { config }, { onProgress, kind: "load" }),
    unload: () => call("unload"),
    stats: () => call("stats"),
    capabilities: () => call("capabilities"),
    countTokens: (messages) => call("count-tokens", { messages }),
    onProviderEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    abort: (attemptId, reason) => call("abort", { target: attemptId, reason }),
    /** The typed fault if the host Worker is gone, else null. */
    fault: () => dead,
    liveness: () => liveness,
    lockName: () => lockNameSeen,
    hostState: () => hostState,

    /** Storage operation on the model files, no model needs to be loaded. engine: "webllm" | "wllama"; action: inspect | install | verify | remove | repair */
    storage(engine, action, args = {}, { onProgress, signal } = {}) {
      let jobId = null;
      const promise = new Promise((resolve, reject) => {
        const d = refuseIfDead(); if (d) return reject(d);
        const id = nextId++; jobId = id;
        pending.set(id, { resolve, reject, onProgress, kind: "storage" });
        target.postMessage({ id, op: "storage", engine, action, args });
      });
      if (signal) {
        const cancel = () => { if (jobId !== null && !dead && !closed) target.postMessage({ id: nextId++, op: "storage-cancel", target: jobId }); };
        if (signal.aborted) cancel(); else signal.addEventListener("abort", cancel, { once: true });
        promise.then(() => signal.removeEventListener("abort", cancel), () => signal.removeEventListener("abort", cancel));
      }
      return promise;
    },

    generate(request, { onToken, signal } = {}) {
      const id = nextId++;
      const events = []; const waiters = []; let doneResolve; const done = new Promise((r) => { doneResolve = r; });
      const stream = {
        ended: false, terminal: null, text: "", lastSeq: -1, firstToken: false,
        attemptId: request?.attemptId ?? null, retryOf: request?.retryOf ?? null, activityId: request?.activityId ?? null, mindId: request?.mindId ?? null,
        push(ev) {
          if (this.terminal) return; // exactly one terminal event, nothing after it
          if (typeof ev.seq === "number") this.lastSeq = ev.seq;
          if (ev.type === "token") { this.firstToken = true; this.text += ev.text; onToken?.(ev); }
          if (TERMINAL.test(ev.type)) this.terminal = ev;
          events.push(ev); waiters.splice(0).forEach((w) => w());
        },
        forceTerminal(ev) { if (this.terminal) return; this.push(ev); this.end(); },
        end() { if (this.ended) return; this.ended = true; doneResolve(this.terminal); waiters.splice(0).forEach((w) => w()); },
        // A protocol-level rejection (bad request, duplicate id) surfaces as a terminal failed event so callers see one shape.
        fail(err) {
          this.forceTerminal({ type: "attempt-failed", attemptId: this.attemptId, retryOf: this.retryOf, activityId: this.activityId, mindId: this.mindId, seq: this.lastSeq + 1, at: Date.now(), tMs: null,
            error: { code: err.code || (err.name === "DuplicateAttempt" ? "duplicate-attempt" : "bad-request"), class: err.class || "invalid-request", message: err.message, phase: "request", retryable: false }, partialText: "" });
        }
      };
      const d = refuseIfDead();
      if (d) {
        queueMicrotask(() => stream.forceTerminal({ type: "attempt-failed", attemptId: stream.attemptId, retryOf: stream.retryOf, activityId: stream.activityId, mindId: stream.mindId, seq: 0, at: Date.now(), tMs: null,
          error: { code: "provider-faulted", class: "runtime-fault", reason: "host-died", message: d.message, advice: d.advice, phase: "queued", retryable: false, providerFault: true }, partialText: "", usage: null }));
      } else if (closed) {
        queueMicrotask(() => stream.forceTerminal({ type: "attempt-failed", attemptId: stream.attemptId, seq: 0, at: Date.now(), tMs: null, error: { code: "provider-closed", class: "provider-unavailable", message: "the provider was closed", phase: "queued", retryable: false }, partialText: "" }));
      } else {
        pending.set(id, { stream, resolve() {}, reject() {}, kind: "generate" });
        target.postMessage({ id, op: "generate", request });
      }
      if (signal) {
        const onAbort = () => { if (!dead && !closed) target.postMessage({ id: nextId++, op: "abort", target: request.attemptId, reason: abortReasonOf(signal.reason) }); };
        if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true });
        done.then(() => signal.removeEventListener("abort", onAbort));
      }
      return {
        attemptId: request?.attemptId,
        done,
        abort: (reason) => { if (!dead && !closed) target.postMessage({ id: nextId++, op: "abort", target: request.attemptId, reason: abortReasonOf(reason) }); },
        [Symbol.asyncIterator]() {
          let i = 0;
          const next = async () => {
            while (true) {
              if (i < events.length) return { value: events[i++], done: false };
              if (stream.ended) return { value: undefined, done: true };
              await new Promise((r) => waiters.push(r));
            }
          };
          return { next, return: async () => ({ value: undefined, done: true }), [Symbol.asyncIterator]() { return this; } };
        }
      };
    },

    /** Load another engine family side by side with the text engine (speech, recognition, embeddings, image). */
    /** `needs.steadyBytes` declares what the engine will hold; with `maxBytes` the host refuses (memory-over-budget) when the declared total of the loaded families, `usedBytes` (what the consumer already holds, for example a language model) and this engine exceeds it. `transfer` moves large buffers in `config`. This is a guard until the measured budget exists, not a policy. */
    loadEngine: (engine, config, { onProgress, transfer, needs, maxBytes, usedBytes } = {}) => call("engine-load", { engine, config, ...(needs ? { needs } : {}), ...(maxBytes != null ? { maxBytes } : {}), ...(usedBytes != null ? { usedBytes } : {}) }, { onProgress, kind: "load", transfer }),
    unloadEngine: (engine) => call("engine-unload", { engine }),

    /**
     * Run one operation of a loaded engine. The caller mints request.invocationId. Partial results arrive through onPart(part, event) in order;
     * `done` never rejects: it resolves with exactly one of invoke-completed | invoke-failed | invoke-aborted.
     */
    invoke(engine, name, request, { onPart, onEvent, signal, transfer } = {}) {
      const id = nextId++;
      let doneResolve; const done = new Promise((r) => { doneResolve = r; });
      const stream = {
        invoke: true, ended: false, terminal: null, lastSeq: -1, invocationId: request?.invocationId ?? null,
        push(ev) {
          if (this.terminal) return;
          if (typeof ev.seq === "number") this.lastSeq = ev.seq;
          if (ev.type === "invoke-part") { try { onPart?.(ev.part, ev); } catch (e) { queueMicrotask(() => { throw e; }); } }
          else { try { onEvent?.(ev); } catch (e) { queueMicrotask(() => { throw e; }); } }   // invoke-queued (with the real position), invoke-started, and the terminal event
          if (INV_TERMINAL.test(ev.type)) this.terminal = ev;
        },
        forceTerminal(ev) { if (this.terminal) return; this.terminal = ev; this.end(); },
        end() { if (this.ended) return; this.ended = true; doneResolve(this.terminal); },
        fail(err) { this.forceTerminal({ type: "invoke-failed", invocationId: this.invocationId, seq: this.lastSeq + 1, at: Date.now(), tMs: null, error: { code: err.code || "bad-request", class: err.class || "invalid-request", message: err.message, phase: "request", retryable: false } }); }
      };
      const d = refuseIfDead();
      if (d) queueMicrotask(() => stream.forceTerminal({ type: "invoke-failed", invocationId: stream.invocationId, seq: 0, at: Date.now(), tMs: null, error: { code: "provider-faulted", class: "runtime-fault", reason: "host-died", message: d.message, advice: d.advice, phase: "queued", retryable: false, providerFault: true } }));
      else if (closed) queueMicrotask(() => stream.forceTerminal({ type: "invoke-failed", invocationId: stream.invocationId, seq: 0, at: Date.now(), tMs: null, error: { code: "provider-closed", class: "provider-unavailable", message: "the provider was closed", phase: "queued", retryable: false } }));
      else { pending.set(id, { stream, resolve() {}, reject() {}, kind: "invoke" }); if (transfer?.length) target.postMessage({ id, op: "invoke", engine, name, request }, transfer); else target.postMessage({ id, op: "invoke", engine, name, request }); }
      const abort = (reason) => { if (!dead && !closed) target.postMessage({ id: nextId++, op: "abort", target: request?.invocationId, reason: abortReasonOf(reason) }); };
      if (signal) { const onAbort = () => abort(signal.reason); if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true }); done.then(() => signal.removeEventListener("abort", onAbort)); }
      return { invocationId: request?.invocationId, done, abort };
    },

    /** Deliberate close by the owner (not a fault): in-flight attempts end as aborted by the supervisor, then the Worker is terminated. */
    terminate(reason = "host-terminated") {
      if (closed || dead) { target.terminate?.(); target.close?.(); return; }
      closed = true;
      const all = [...pending.entries()]; pending.clear();
      for (const [, p] of all) {
        if (p.stream?.invoke) {
          const s = p.stream;
          s.forceTerminal({ type: "invoke-aborted", invocationId: s.invocationId, seq: s.lastSeq + 1, at: Date.now(), tMs: null, reason, by: "supervisor", deliberate: true, phase: "invoke" });
        } else if (p.stream) {
          const s = p.stream;
          s.forceTerminal({ type: "attempt-aborted", attemptId: s.attemptId, retryOf: s.retryOf, activityId: s.activityId, mindId: s.mindId, seq: s.lastSeq + 1, at: Date.now(), tMs: null, reason, by: "supervisor", deliberate: true, partialText: s.text, phase: s.firstToken ? "decode" : "prefill" });
        } else p.reject(typedError({ class: "provider-unavailable", code: "provider-closed", message: `the provider was closed (${reason})`, name: "ProviderClosed" }));
      }
      hostState = "terminated";
      target.terminate?.(); target.close?.();
    }
  };
}

// Main thread: give a mind worker its own channel to the shared inference host.
//   const port = openPort(hostWorker);  mindWorker.postMessage({ port }, [port]);   // in the mind worker: createProvider(msg.port)
export function openPort(hostWorker) {
  const { port1, port2 } = new MessageChannel();
  hostWorker.postMessage({ op: "connect-port" }, [port1]);
  return port2;
}
