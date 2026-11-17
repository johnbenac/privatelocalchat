// Module Worker entry: the ONE inference host for the page. Hosts host-core with the real adapters.
// Provenance: productionised from spikes/llm/provider/host.worker.js (FAB-02). Adapters and storage modules are imported lazily
// so a page that only uses one engine never fetches the other's bundle (the WebLLM bundle is 6.8 MB, wllama 0.4 MB + 22 MB wasm).
//
// Liveness: the Worker takes an exclusive Web Lock on a random name at start-up and never releases it. Every client (the page,
// each mind worker) requests the same name; the browser releases a dead Worker's locks, which is how a crash or kill that raises
// no event is detected (client.mjs). If navigator.locks is missing the `ready` message says so and the client reports it loudly.
import { createHost } from "./host-core.mjs";
import { MockAdapter } from "./adapters/mock.mjs";

const lazyAdapter = (path, name) => () => {
  let inner = null;
  return {
    async preflight(config) { const mod = await import(path); await mod.preflight?.(config); },
    async load(config, hooks) { const mod = await import(path); inner = new mod[name](); return inner.load(config, hooks); },
    run: (req, signal, emit) => inner.run(req, signal, emit),
    unload: async () => { const i = inner; inner = null; return await i?.unload(); },
    stats: async () => (inner?.stats ? inner.stats() : null),
    countTokens: async (messages) => (inner?.countTokens ? inner.countTokens(messages) : null)
  };
};
const lazyStorage = (path) => new Proxy({}, {
  get: (_t, action) => async (args, hooks) => {
    const mod = await import(path); const fn = mod.storageOps?.[action];
    if (typeof fn !== "function") throw new TypeError(`storage action ${String(action)} is not implemented by ${path}`);
    return fn(args, hooks);
  }
});

const lockName = typeof crypto?.randomUUID === "function" ? `cfp-model-host-${crypto.randomUUID()}` : `cfp-model-host-${Math.random().toString(36).slice(2)}${Date.now()}`;
const hasLocks = typeof navigator !== "undefined" && !!navigator.locks?.request;

const host = createHost({
  providerId: "cfp-model-host",
  livenessLock: hasLocks ? lockName : null,
  adapters: {
    mock: () => new MockAdapter(),
    wllama: lazyAdapter("./adapters/wllama.mjs", "WllamaAdapter"),
    webllm: lazyAdapter("./adapters/webllm.mjs", "WebLlmAdapter")
  },
  storage: { webllm: lazyStorage("./adapters/webllm.mjs"), wllama: lazyStorage("./adapters/wllama.mjs"), mock: lazyStorage("./adapters/mock.mjs") }
});

// Messages that arrive before the lock is held are buffered, then replayed, so a client that talks early is never dropped.
let attached = false; const early = [];
const route = (e) => {
  if (e.data?.op === "connect-port" && e.ports?.[0]) { host.attach(e.ports[0]); return; }
  self.__directHandler(e);
};
self.onmessage = (e) => { if (!attached) early.push(e); else route(e); };

const start = () => {
  host.attach(self);                       // sets self.onmessage to the direct handler and announces `ready`
  self.__directHandler = self.onmessage;
  self.onmessage = route;
  attached = true;
  for (const e of early.splice(0)) route(e);
};

if (hasLocks) {
  // Granted at once (nobody else uses this random name); the callback's promise never settles, so the lock lives as long as the Worker.
  navigator.locks.request(lockName, { mode: "exclusive" }, () => { start(); return new Promise(() => {}); });
} else {
  start();
}
