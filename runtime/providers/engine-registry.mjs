// The engine registry (T1110): everything but the package's own three engines, so an entry that imports ONLY this file never pulls an adapter into its closure. defaultRegistry() lives in registry-core.mjs.
// The engine registry core: which engines can run and what each one answers. Small on purpose: the default Worker entry imports ONLY this (not the support explanation, the page-host guard
// or the own-worker wrapper, which are page-side and live in registry.mjs). Pure: no DOM, no window global, nothing read at import.
//
// The default registry is exactly the three engines the package has always had (webllm, wllama, mock).

export const ENGINE_KINDS = Object.freeze(["language", "speech-synthesis", "speech-recognition", "embedding", "image"]);

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const GROUP = /^[a-z][a-z0-9-]{0,39}$/;

function lazyAdapter(spec) {
  return () => {
    let inner = null;
    const make = async () => {
      if (spec.createAdapter) return spec.createAdapter();
      const mod = await spec.load(); const Cls = mod[spec.adapterExport];
      if (typeof Cls !== "function") throw new TypeError(`engine ${spec.name}: the module has no export ${spec.adapterExport}`);
      return new Cls();
    };
    return {
      async preflight(config) { if (spec.preflight) return spec.preflight(config); if (spec.load) { const mod = await spec.load(); await mod.preflight?.(config); } },
      async load(config, hooks) { inner = await make(); return inner.load(config, hooks); },
      run: (req, signal, emit) => inner.run(req, signal, emit),
      invoke: async (name, request, signal, emit) => { if (typeof inner?.invoke !== "function") throw Object.assign(new Error(`engine ${spec.name} has no invoke operation`), { name: "ConfigError" }); return inner.invoke(name, request, signal, emit); },
      unload: async () => { const i = inner; inner = null; return await i?.unload?.(); },
      stats: async () => (inner?.stats ? inner.stats() : null),
      countTokens: async (messages) => (inner?.countTokens ? inner.countTokens(messages) : null)
    };
  };
}
function lazyStorage(spec) {
  const fromModule = spec.storage ?? (spec.load ? async () => (await spec.load()).storageOps : null);
  if (!fromModule) return null;
  return new Proxy({}, { get: (_t, action) => async (args, hooks) => {
    const ops = typeof fromModule === "function" ? await fromModule() : fromModule;
    const fn = ops?.[action];
    if (typeof fn !== "function") throw new TypeError(`storage action ${String(action)} is not implemented by engine ${spec.name}`);
    return fn(args, hooks);
  } });
}

export function createEngineRegistry() {
  const engines = new Map();
  const api = {
    /** spec: {kind, group?, worker?, load | createAdapter, adapterExport?, ops?, supports?, storage?, preflight?, license?, engineVersions?} */
    register(name, spec) {
      if (typeof name !== "string" || !NAME.test(name)) throw new TypeError(`engine name must be lower-case letters, digits and hyphens: ${String(name)}`);
      if (engines.has(name)) throw new TypeError(`engine ${name} is already registered`);
      if (!spec || typeof spec !== "object") throw new TypeError(`engine ${name}: a spec object is required`);
      if (!ENGINE_KINDS.includes(spec.kind)) throw new TypeError(`engine ${name}: kind must be one of ${ENGINE_KINDS.join(", ")}`);
      if (typeof spec.load !== "function" && typeof spec.createAdapter !== "function") throw new TypeError(`engine ${name}: give load (a lazy module import) or createAdapter`);
      const group = spec.group ?? "default";
      if (!GROUP.test(group)) throw new TypeError(`engine ${name}: bad group ${group}`);
      const ops = spec.ops ?? (spec.kind === "language" ? ["generate"] : []);
      if (!Array.isArray(ops) || !ops.every((o) => typeof o === "string" && o)) throw new TypeError(`engine ${name}: ops must be a list of operation names`);
      if (spec.worker != null && (typeof spec.worker !== "object" || typeof spec.worker.url !== "string")) throw new TypeError(`engine ${name}: worker must be {url, ...}`);
      engines.set(name, Object.freeze({ ...spec, name, group, ops: Object.freeze([...ops]), worker: spec.worker ?? null, adapterExport: spec.adapterExport ?? "Adapter" }));
      return api;
    },
    has: (name) => engines.has(name),
    get: (name) => engines.get(name) ?? null,
    names: () => [...engines.keys()],
    list: () => [...engines.values()],
    /** group name -> engine names: engines in one group share a Worker */
    groups() { const g = new Map(); for (const e of engines.values()) { if (!g.has(e.group)) g.set(e.group, []); g.get(e.group).push(e.name); } return g; },
    /** The maps createHost wants: lazy adapter factories and lazy storage operations. An engine with its own worker is wrapped by createWorkerEngine, passed as spec.createAdapter. */
    hostOptions() {
      const adapters = {}; const storage = {};
      for (const e of engines.values()) { adapters[e.name] = lazyAdapter(e); const st = lazyStorage(e); if (st) storage[e.name] = st; }
      return { adapters, storage };
    }
  };
  return api;
}
