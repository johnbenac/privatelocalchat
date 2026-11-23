// The ModelHost: the page-side owner of the one inference host Worker, of which tier is selected and why, of the model files in the
// browser's storage, and of the load state. It is what the model manager panel (public/src/models/) talks to, and what the app gives
// the supervisor so each mind worker can get its own MessagePort to the shared host.
//
//   const host = createModelHost({ sources: null /* official hosts */ });
//   await host.init({ autoLoad: true });
//   host.subscribe((state) => render(state));
//   host.provider()          the main-thread client (createProvider) for the current host Worker
//   host.openMindPort()      a MessagePort for a mind worker:  mindWorker.postMessage({ port }, [port]); createProvider(port) there
//
// Rules this object keeps (plan/PLAN.md section 0):
//   * no silent fallback: it never picks another tier. (Where the small model runs, graphics card or processor, is not a tier: it is the
//     same model and files, chosen from the device's capabilities and always shown in the state as `backend`.) The tier is the human's setting (or the measured default). A failure on the
//     default tier is shown with advice that mentions the light tier; switching is a deliberate human action (selectTier).
//   * every failure is recorded in the state (last error, plain message + the raw one) AND the method rejects with the typed error.
//   * a retry is a new attempt: each load() call increments `loadAttempt`; nothing retries by itself.
//   * no network call except the model files from the catalogue's hosts (or an explicit, visibly labelled override).
import { createProvider, openPort } from "./client.mjs";
import { normalizeSources, applyPosture, originsOf } from "./sources-core.mjs";
import { gatherEnv } from "./capability-probe.mjs";
import { classifyEngineError } from "./errors.mjs";
import { lightBackend, tierBackend } from "./auto-tier.mjs";



export function createModelHost({
  catalog,                       // REQUIRED: what is offered, its files and its load configs (catalog-core.mjs makes one from manifests; model-host.mjs supplies the original catalogue)
  workerUrl = new URL("./host.worker.mjs", import.meta.url).href,
  runtimeDir = new URL("./vendor/wllama/v1q/", import.meta.url).href,
  sources: sourceOverrides = null,
  sourceList = null,             // an ORDERED list of places the files may come from: [{id, label?, base, kind?: "https"|"path"|"files"|"archive", privacy?, credentials?: "request", files?: Map, blob?: Blob}]; none = the catalogue's own base only
  fallback = true,               // with a list: true tries the catalogue's own base after the list; false contacts ONLY the first source and a failure is a failure (no silent move to another host)
  posture = null,                // {mode: "curated"|"open" (default), approve(base) => boolean}: a network source it does not approve is refused by name (source-not-approved) and never contacted
  diagnostics = true,            // false forces every adapter's debug knobs off in the load config (the host Worker does the same with its own flag); a RELEASE build has the marked blocks removed altogether
  credentials = null,            // async ({endpoint}) => {headers} | {none:true} | {refused:true}: asked per request over the port; the token never leaves the page except in that one request's headers
  settings,                      // the application's settings store (getItem/setItem), or null for none: required, so the component names no storage of the app
  storageManager = globalThis.navigator?.storage ?? null,
  createWorker = (url) => new Worker(url, { type: "module" }),
  tiers = catalog?.tiers,
  loadConfigOverride = null,     // tests: (tier, base) => config, e.g. to run a mock adapter through the whole manager
  now = () => Date.now(),
  envProbe = () => gatherEnv(),
  userAgent = () => globalThis.navigator?.userAgent || "",
  maxTouchPoints = () => globalThis.navigator?.maxTouchPoints || 0,
  // page-side options of a consumer (functions cannot cross to the Worker, so these live here):
  probes = [],                   // async ({env}) => facts merged into env (a compute probe, a gpu-kernels check)
  deviceGate = null,             // async ({env, variant}) => {offered?: tierKey[], allow?: tierKey[], prefer?, chosenBy?, reasonFor?, tiers?}; the result goes into state.deviceGate unchanged; an empty list means NOTHING is offered (fail closed)
  onNotOffered = null,           // (tier, gate) => Error: the typed error install, repair and load throw for a tier the gate did not offer
  backendPolicy = null,          // (env, {tier, userAgent, maxTouchPoints}) => "gpu" | "cpu", a pure function of the environment; default: the package's auto-tier (which reads the user agent)
  gateUnmeasured = () => ({ measured: false }),   // the per-tier value of a tier the gate did not describe
  gateFailure = (error) => ({ offered: [], error: String(error?.message || error), summary: `The device gate failed: ${error?.message || error}. No model is offered until it works.` }),   // the result of a gate that threw
  settingsKey = catalog?.settingsKey ?? "model-runtime.selection.v1",   // where the person's choice is stored (a catalogue names its own key; the original catalogue says plc.models.v1); the shape {tier, chosenBy, at} does not change
} = {}) {
  if (settings === undefined) throw new TypeError("createModelHost needs a settings store: pass the application's (getItem/setItem) or null for none");
  if (!catalog || typeof catalog !== "object" || !catalog.tiers || !Array.isArray(catalog.order)) throw new TypeError("createModelHost needs a catalog: createCatalog(...) or defaultCatalog(...) from the package, or use model-host.mjs for the original catalogue");
  const TIER_ORDER = catalog.order, VARIANT_INFO = catalog.variantInfo ?? {}, DEFAULT_VARIANT = catalog.defaultVariant ?? null;
  const DEFAULT_REASON = catalog.texts?.defaultReason ?? "The first model in the list is the starting choice.";
  const chooseWebllmVariant = (env) => catalog.chooseVariant(env), resolveSources = (o) => catalog.resolveSources(o), tierFiles = (t, s, v) => catalog.tierFiles(t, s, v);
  const loadConfigFor = (t, o) => catalog.loadConfigFor(t, o), isWllamaTier = (t) => catalog.runsOnProcessor(t);
  const src = resolveSources(sourceOverrides);
  const subscribers = new Set();
  const ua = () => String(userAgent() ?? "");   // a null user agent is the empty string: the capability rules never need it
  let variant = DEFAULT_VARIANT;
  let offered = null;            // the tier keys the device gate offered, or null when there is no gate (no restriction)
  let gateResult = null;         // the gate's result as returned (it may carry functions such as reasonFor; the state keeps only its data)
  let worker = null; let client = null; let workerGeneration = 0;
  let loadAttempt = 0;
  let transferController = null;
  let lastEmit = 0; let emitTimer = null;

  const state = {
    device: null,
    selection: { tier: catalog.defaultTier, chosenBy: "default", reason: DEFAULT_REASON, at: null },
    notices: [],
    source: { label: src.label, overridden: src.overridden },
    variant: { chosen: DEFAULT_VARIANT, why: "default build until the GPU is probed" },
    backend: { light: "gpu", why: "graphics card until the device is probed" },
    tiers: Object.fromEntries(TIER_ORDER.map((t) => [t, { info: tiers[t], install: { state: "unknown", checkedAt: null } }])),
    transfer: null,
    load: { state: "unloaded", tier: null, loadAttempt: 0, progress: null, lastError: null, loadedAt: null, loadMs: null, info: null },
    host: { state: "none", restarts: 0, liveness: "unknown", startedAt: null, workerGeneration: 0 },
    storage: { usage: null, quota: null, persisted: null, error: null, at: null },
    lastError: null,
    busy: null
  };

  // ---- state plumbing ----------------------------------------------------------------------------------------------
  const snapshot = () => structuredClone(state);
  function emit(force = true) {
    const t = now();
    if (!force && t - lastEmit < 200) { if (!emitTimer) emitTimer = setTimeout(() => { emitTimer = null; emit(true); }, 200); return; }
    lastEmit = t;
    const snap = snapshot();
    for (const fn of subscribers) { try { fn(snap); } catch (e) { queueMicrotask(() => { throw e; }); } }
  }
  // a notice may be reworded or suppressed by the catalogue's texts: texts.notice(kind, message, code) returns a string, or false / "" / null to say nothing
  function notice(kind, message, code = null) { const own = catalog.texts?.notice ? catalog.texts.notice(kind, message, code) : message; if (own === false || own === "" || own === null) return; state.notices.push({ kind: kind, message: typeof own === "string" ? own : message, at: now() }); if (state.notices.length > 20) state.notices.shift(); }
  function recordError(context, err) {
    const c = err?.class ? err : { ...classifyEngineError(err, { phase: "install" }) };
    const e = { context, class: c.class, code: c.code ?? null, reason: c.reason ?? null, message: String(c.message ?? err?.message ?? err), advice: c.advice ?? null, phase: err?.phase ?? null, loadAttempt: err?.loadAttempt ?? null, detail: err?.detail ?? null, at: now() };
    state.lastError = e;
    return e;
  }

  function reasonFor(tier, at) {
    const own = catalog.texts?.reasonFor?.(tier, at); if (typeof own === "string" && own) return own;   // the consumer's own wording
    const when = at ? ` on ${new Date(at).toLocaleString()}` : "";
    return `${tiers[tier]?.label || tier}, chosen by you${when}.`;
  }

  // The default model comes in two builds; the GPU decides (capability, DEC 57). Applies only to the real WebLLM tier.
  function applyVariant(v, why) {
    variant = v; state.variant = { chosen: v, why };
    for (const t of TIER_ORDER) state.tiers[t].info = catalog.applyVariant ? catalog.applyVariant(t, tiers[t], v) : tiers[t];
  }
  async function chooseVariantFromGpu() {
    let env; try { env = await envProbe(); for (const probe of probes) { try { Object.assign(env, (await probe({ env })) ?? {}); } catch (e) { notice("probe", `A device probe failed (${e?.message || e}); the facts it measures are missing.`); } } } catch (e) { notice("probe", `Could not read the GPU's capabilities (${e?.message || e}); using the ${DEFAULT_VARIANT} build.`); return; }
    state.device = env;
    const lb = backendPolicy ? backendPolicy(env, { tier: "light", userAgent: ua(), maxTouchPoints: maxTouchPoints() }) : lightBackend({ env, userAgent: ua(), maxTouchPoints: maxTouchPoints() });
    state.backend = { light: lb, why: backendPolicy ? "set by the consumer's backend policy" : lb === "cpu" ? "no usable graphics card here, so the small model runs on the processor (slower)" : "the graphics card runs the small model" };
    if (DEFAULT_VARIANT === null) return;   // a catalogue without builds has no variant to choose
    const v = chooseWebllmVariant(env);
    if (v === null) { state.variant = { chosen: variant, why: `no WebGPU adapter (${env.webgpu?.reason || "unknown"}); loading will fail with a clear error` }; return; }
    applyVariant(v, v === "q4f16_1" ? "this GPU supports shader-f16" : "this GPU has no shader-f16, so the f32 build is used");
  }

  // ---- settings ----------------------------------------------------------------------------------------------------
  function readSettings() {
    if (!settings) { notice("settings", "No persistent settings store is available; the tier choice will not survive a reload."); return; }
    let raw = null; try { raw = settings.getItem(settingsKey); } catch (e) { notice("settings", `Could not read the saved model settings: ${e?.message || e}`); return; }
    if (raw === null) return;
    try {
      const v = JSON.parse(raw);
      if (!TIER_ORDER.includes(v.tier)) throw new Error(`unknown tier ${JSON.stringify(v.tier)}`);
      if (v.chosenBy !== "human") throw new Error("only a tier chosen by the human may be stored");
      state.selection = { tier: v.tier, chosenBy: "human", at: v.at ?? null, reason: reasonFor(v.tier, v.at ?? null) };
    } catch (e) {
      notice("settings", `The saved model choice is unreadable (${e?.message || e}); using the default tier. Choose a tier again to replace it.`);
    }
  }
  function writeSettings() {
    if (!settings) return;
    try { settings.setItem(settingsKey, JSON.stringify({ tier: state.selection.tier, chosenBy: "human", at: state.selection.at })); }
    catch (e) { notice("settings", `Could not save the model choice: ${e?.message || e}`); }
  }

  // ---- device gate (page-side, between the variant and the selection) ---------------------------------------------------
  async function applyGate() {
    if (!deviceGate) return;
    let result;
    // The gate sees the environment (null when the probe failed), the chosen variant, the tiers' info after the variant was applied and the install state of each tier as last inspected
    // (unknown at the first start: nothing has been inspected yet). It is the consumer's own decision, so FAILING CLOSED is the rule: only a result with a well-formed list of tier keys
    // (`offered` or `allow`) offers anything, `allowAll: true` says "no restriction" in so many words, and ANYTHING ELSE (nothing, an empty object, a string, a list naming no tier) offers nothing.
    try { result = await deviceGate({ env: state.device, variant, tiers: Object.fromEntries(TIER_ORDER.map((t) => [t, state.tiers[t].info])), install: Object.fromEntries(TIER_ORDER.map((t) => [t, state.tiers[t].install])) }); }
    catch (e) { notice("gate", `The device gate failed (${e?.message || e}); no model is offered until it works.`, "gate-failed"); result = gateFailure(e); }
    const list = Array.isArray(result?.offered) ? result.offered : Array.isArray(result?.allow) ? result.allow : null;
    if (result?.allowAll === true) offered = null;
    else if (list && list.every((k) => typeof k === "string" && TIER_ORDER.includes(k))) offered = [...list];
    else { if (!(Array.isArray(result?.offered) && result.offered.length === 0)) notice("gate", "The device gate returned no usable list of tiers; no model is offered until it does.", "gate-malformed"); offered = []; }
    gateResult = result;
    state.deviceGate = result && typeof result === "object" ? Object.fromEntries(Object.entries(result).filter(([, v]) => typeof v !== "function")) : { offered: [], summary: "The device gate returned no usable result." };
    for (const t of TIER_ORDER) state.tiers[t].gate = result?.tiers?.[t] ?? gateUnmeasured(t);   // a tier the gate did not describe gets the consumer's own value, or {measured:false}
  }
  // A tier the PERSON chose is never changed, even when it is not offered (loading it throws the consumer's typed error). A selection nobody chose moves to the
  // gate's preference or the first offered tier. An unavailable saved choice is a notice, never a silent switch.
  function reconcileSelection() {
    if (!offered) return;
    const sel = state.selection;
    if (offered.includes(sel.tier)) return;
    if (sel.chosenBy === "human") { notice("gate", `${tiers[sel.tier]?.label || sel.tier} is not offered on this device. Your choice is kept; loading it will say why.`, "choice-not-offered"); return; }
    const gate = gateResult || {};
    const next = offered.includes(gate.prefer) ? gate.prefer : offered[0];
    if (next === undefined) { notice("gate", "No model is offered on this device.", "nothing-offered"); return; }
    state.selection = { tier: next, chosenBy: gate.chosenBy ?? "capability", at: gate.at ?? null, reason: gate.reasonFor?.(next, sel.tier) ?? `${tiers[next]?.label || next} fits this device; ${tiers[sel.tier]?.label || sel.tier} does not.` };
  }
  function assertOffered(tier) {
    if (!offered || offered.includes(tier)) return;
    throw onNotOffered ? onNotOffered(tier, gateResult) :   // the RAW gate result, functions included
      Object.assign(new Error(`${tiers[tier]?.label || tier} is not offered on this device`), { class: "unsupported", code: "tier-not-offered", reason: "not-offered", advice: "This model does not fit this device. Choose another one in Settings > Models." });
  }

  // ---- host Worker -------------------------------------------------------------------------------------------------
  function startWorker() {
    state.host.state = "starting";
    worker = createWorker(diagnostics ? workerUrl : workerUrl + (workerUrl.includes("?") ? "&" : "?") + "diagnostics=0");   // the Worker entry reads it
    const gen = ++workerGeneration; state.host.workerGeneration = gen;
    client = createProvider(worker, {
      credentials, diagnostics,
      onProviderEvent: (m) => {
        if (gen !== workerGeneration) return;
        if (m.type === "liveness-unavailable") { state.host.liveness = "unavailable"; notice("liveness", m.message); emit(); return; }
        if (m.type !== "provider-state") return;
        if (m.state === "faulted" && m.detail?.phase === "host") {
          state.host.state = "dead";
          state.load = { ...state.load, state: "faulted", progress: null, lastError: { class: "runtime-fault", code: "provider-fault", reason: "host-died", message: m.detail.message, advice: "The model host Worker stopped unexpectedly, so the loaded model is gone and anything it was generating failed. Nothing was retried. Press Restart to start a new host, then Load (a new load attempt).", loadAttempt: state.load.loadAttempt, phase: "host", at: now() } };
          state.lastError = { context: "host", ...state.load.lastError };
          emit();
        } else if (m.state === "faulted") {
          const error = {class:m.detail?.class || "runtime-fault",code:m.detail?.code || "engine-fault",message:m.detail?.message || "The local model stopped.",advice:"Restart the model engine, then load the downloaded model again. Your chats and downloaded files are kept.",phase:m.detail?.phase || "generate",at:now()};
          state.load={...state.load,state:"faulted",info:null,progress:null,lastError:error};
          state.lastError={context:"engine",...error};
          emit();
        }
      }
    });
    const thisClient = client;
    return thisClient.ready().then((m) => {
      if (gen !== workerGeneration) return m;
      state.host.state = "running"; state.host.startedAt = now(); state.host.liveness = thisClient.liveness(); emit();
      return m;
    }, (err) => {
      // the Worker died before it said ready (for example its script failed to load): loud, and recorded
      if (gen === workerGeneration) { state.host.state = "dead"; recordError("host", err); emit(); }
      throw err;
    });
  }

  async function ensureHost() {
    if (!client || state.host.state === "none") await startWorker();
    else if (state.host.state === "starting") await client.ready();
    if (state.host.state === "dead") throw Object.assign(new Error(client.fault()?.message || "the model host Worker is gone"), { ...(client.fault() || {}), class: "runtime-fault" });
    return client;
  }

  function retireWorker(reason) {
    // Synchronous end of the current host (dispose). Not a fault.
    if (client) client.terminate(reason); else worker?.terminate?.();
    client = null; worker = null; workerGeneration++; state.host.state = "none";
  }

  // Full disposal before another host starts (tier switch, restart): unload the engine so GPU buffers are released, terminate the
  // Worker, then WAIT until the browser reports the Worker's liveness lock released, i.e. it is really gone. Two resident hosts in one
  // Safari process (one still tearing down while the next loads) is the suspected cause of a first reply failing with host-died.
  async function retireWorkerFully(reason) {
    const c = client; const lock = c?.lockName?.();
    if (c && state.host.state === "running" && !c.fault()) {
      try { await c.unload(); } catch (e) { notice("dispose", `Unloading the previous model before ${reason} failed (${e?.message || e}); the host is terminated anyway.`); }
    }
    retireWorker(reason);
    if (lock && globalThis.navigator?.locks?.request) await navigator.locks.request(lock, { mode: "exclusive" }, () => {}); // granted only once the old Worker is gone
    else if (c) notice("dispose", "Web Locks are unavailable, so the app cannot confirm the previous host Worker has fully exited.");
  }

  // ---- inventory ---------------------------------------------------------------------------------------------------
  function filesOf(tier) { return tierFiles(tier, src.sources, variant); }
  const listedSources = normalizeSources(sourceList);
  const posted = applyPosture(listedSources, posture);
  if (posted.refused.length) queueMicrotask(() => notice("source", `Not approved on this page, never contacted: ${posted.refused.join(", ")}.`, "source-not-approved"));
  /** What a storage job needs to use the list: data only (functions stay on the page). */
  function sourceArgs() { return listedSources.length ? { sourceList: listedSources, fallback, refusedSources: posted.refused } : {}; }
  // with a source list each file also says where it sits under a source's base (`rel`), so a mirror, a folder or an archive can be asked for it
  function storageArgs(tier, extra = {}) { const files = filesOf(tier); return { files: extra.sourceList && catalog.relFor ? files.map((f) => ({ ...f, rel: catalog.relFor(tier, f, variant), bundleRel: catalog.bundleRelFor?.(tier, f, variant) ?? null })) : files, runtimeDir, ...extra }; }
  function engineOf(tier) { return tiers[tier].engine; }
  const summarize = (r) => ({ state: r.state, ok: r.ok, files: r.files, okFiles: r.okFiles, missing: r.missing?.length ?? 0, bad: (r.bad || []).slice(0, 12), bytesPresent: r.bytesPresent, bytesTotal: r.bytesTotal, deep: r.deep ?? false, ms: r.ms ?? null, where: r.where ?? null, checkedAt: now() });

  async function runTransfer(kind, tier, fn) {
    if (state.busy) throw Object.assign(new Error(`cannot ${kind}: the manager is busy with ${state.busy}`), { class: "provider-unavailable", code: "manager-busy" });
    state.busy = kind;
    transferController = new AbortController();
    state.transfer = { kind, tier, phase: kind, bytesDone: 0, bytesTotal: tiers[tier].downloadBytes, bytesKept: 0, bytesPerSecond: null, etaSeconds: null, filesDone: 0, filesTotal: 0, active: [], startedAt: now() };
    emit();
    try {
      const c = await ensureHost();
      const result = await fn(c, transferController.signal, (p) => {
        state.transfer = { ...state.transfer, ...p, kind, tier };
        emit(false);
      });
      state.lastError = state.lastError?.context === kind ? null : state.lastError;
      return result;
    } catch (err) {
      // a download that stopped part-way leaves complete files behind: say what is true now, not what was last measured
      if (kind === "install" || kind === "repair") {
        try {
          const c = client;
          if (c && state.host.state === "running" && !c.fault()) state.tiers[tier].install = summarize(await c.storage(engineOf(tier), "inspect", storageArgs(tier), {}));
        } catch { /* the stale state stays, with lastCheckError below */ }
      }
      if (err?.class === "aborted" || err?.name === "AbortError") { notice("transfer", `${kind} cancelled; completed files are kept.`); throw err; }
      state.tiers[tier].install = { ...state.tiers[tier].install, lastCheckError: err?.message };
      recordError(kind, err);
      throw err;
    } finally {
      state.busy = null; state.transfer = null; transferController = null;
      await refreshStorage().catch(() => {});
      emit();
    }
  }

  // ---- public API --------------------------------------------------------------------------------------------------
  const api = {
    /** The origins this host may contact, grouped by use ({connect, worker, wasm, script}), from the catalogue's files, the source list, the runtime files and the host Worker: a consumer derives its content security policy from this, not from a guess. Relative addresses (this page's own origin) are not listed. */
    origins(extra = {}) {
      const files = [];
      for (const t of TIER_ORDER) { try { for (const f of tierFiles(t, src.sources, variant)) files.push(f); } catch { /* a tier this catalogue does not have */ } }
      const rt = String(runtimeDir).endsWith("/") ? String(runtimeDir) : String(runtimeDir) + "/";
      const runtimeFiles = ["compat.wasm", "compat-worker.js", "wllama.js"].map((n) => ({ path: n, url: rt + n }));
      for (const f of files) if (f.scope === "webllm/wasm") runtimeFiles.push({ path: f.path, url: f.url });
      const o = originsOf({ files: files.filter((f) => f.scope !== "webllm/wasm"), runtimeFiles, sources: listedSources });
      // hosts a consumer knows its sources redirect to (a model hub's download hosts), by use: `origins({connect: [...]})`; they are added, never guessed
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...new Set([...v, ...(extra[k] ?? [])])].sort()]));
    },
    getState: snapshot,
    subscribe(fn) { subscribers.add(fn); fn(snapshot()); return () => subscribers.delete(fn); },
    provider() { if (!client) throw new Error("the model host has not been started; call init()"); return client; },
    /** A MessagePort wired to the shared host for one mind worker. Transfer it: mindWorker.postMessage({ port }, [port]). */
    openMindPort() { if (!worker || state.host.state !== "running") throw Object.assign(new Error("the model host is not running"), { class: "provider-unavailable", code: "host-not-running" }); return openPort(worker); },
    tierConfig(tier = state.selection.tier) { const base = loadConfigFor(tier, { sources: src.sources, runtimeDir, variant, backend: isWllamaTier(tier) ? (state.device ? (backendPolicy ? backendPolicy(state.device, { tier, userAgent: ua(), maxTouchPoints: maxTouchPoints() }) : tierBackend({ env: state.device, userAgent: ua(), maxTouchPoints: maxTouchPoints(), tier })) : state.backend.light) : "gpu" }); return loadConfigOverride ? loadConfigOverride(tier, base) : base; },

    async init({ autoLoad = false } = {}) {
      readSettings();                 // the person's saved choice, read first as it always was (the notice order is unchanged)
      await chooseVariantFromGpu();   // the device's facts (plus the consumer's probes), then the variant, then the backend
      await applyGate();              // the consumer's page-side gate, before any tier is chosen
      reconcileSelection();           // the saved choice validated against what is offered
      await startWorker();
      await refreshStorage().catch((e) => { state.storage.error = String(e?.message || e); });
      emit();
      if (autoLoad) {
        // inspect + load in one step: load() refuses (typed) if the files are not all there; it never downloads
        try { await api.load(); } catch { /* recorded in state.load.lastError; the panel shows it */ }
      } else {
        try { await api.inspect(); } catch { /* recorded */ }
      }
      return api.getState();
    },

    /** Human action only. `confirmed` must be true: the panel shows the memory/speed warning first. */
    async selectTier(tier, { confirmed = false } = {}) {
      if (!TIER_ORDER.includes(tier)) throw new RangeError(`unknown tier ${tier}`);
      if (confirmed !== true) throw Object.assign(new Error("selecting a tier needs the human's confirmation (confirmed: true)"), { class: "invalid-request", code: "not-confirmed" });
      assertOffered(tier);   // a tier the device gate did not offer is refused here as everywhere else: no switch, no worker, the stored choice untouched
      if (tier === state.selection.tier) return api.getState();
      if (state.busy) throw Object.assign(new Error(`cannot switch tier while ${state.busy}`), { class: "provider-unavailable", code: "manager-busy" });
      const at = now();
      state.selection = { tier, chosenBy: "human", at, reason: reasonFor(tier, at) };
      writeSettings();
      // a fresh host Worker returns the previous model's memory; running thoughts end as aborted by the supervisor
      await retireWorkerFully("tier-switch");
      state.load = { state: "unloaded", tier: null, loadAttempt: state.load.loadAttempt, progress: null, lastError: null, loadedAt: null, loadMs: null, info: null };
      state.lastError = null;
      emit();
      await startWorker();
      try { await api.inspect(); } catch { /* recorded */ }
      return api.getState();
    },

    async inspect(tier = state.selection.tier) {
      const r = await runTransfer("inspect", tier, async (c, signal, onProgress) => {
        const res = await c.storage(engineOf(tier), "inspect", storageArgs(tier), { signal, onProgress });
        state.tiers[tier].install = summarize(res); return res;
      });
      return r;
    },

    /** Download everything missing or bad (complete files are kept: that is resume). Checks size and SHA-256 of every file. */
    async install(tier = state.selection.tier) {
      assertOffered(tier);
      return runTransfer("install", tier, async (c, signal, onProgress) => {
        const res = await c.storage(engineOf(tier), "install", storageArgs(tier, { verifyHash: true, ...sourceArgs() }), { signal, onProgress });
        state.tiers[tier].install = summarize(res); state.tiers[tier].lastInstall = { fetchedBytes: res.fetchedBytes, keptBytes: res.keptBytes, replaced: res.replaced, at: now(), ...(res.servedBy ? { sources: res.servedBy } : {}) };   // which source served each file: a person can see it
        return res;
      });
    },

    /** Re-check the files. deep:true also hashes every file against the pinned SHA-256 (slow). */
    async verify({ deep = false, tier = state.selection.tier } = {}) {
      return runTransfer(deep ? "verify-deep" : "verify", tier, async (c, signal, onProgress) => {
        const res = await c.storage(engineOf(tier), "verify", storageArgs(tier, { deep }), { signal, onProgress });
        state.tiers[tier].install = summarize(res);
        return res;
      });
    },

    /** Delete exactly the bad or partial files and download them again. */
    async repair(tier = state.selection.tier) {
      assertOffered(tier);
      if (state.load.state === "ready" && state.load.tier === tier) await api.unload();
      return runTransfer("repair", tier, async (c, signal, onProgress) => {
        // repair goes through the same source list, fallback and posture as install: it never contacts a host the person's policy forbids
        const res = await c.storage(engineOf(tier), "repair", storageArgs(tier, { verifyHash: true, ...sourceArgs() }), { signal, onProgress });
        state.tiers[tier].install = summarize(res); state.tiers[tier].lastInstall = { fetchedBytes: res.fetchedBytes, keptBytes: res.keptBytes, replaced: res.replaced, at: now(), ...(res.servedBy ? { sources: res.servedBy } : {}) };
        return res;
      });
    },

    /** Delete the downloaded files of a tier (the human confirmed). Unloads the model first if it is the loaded one. */
    async remove(tier = state.selection.tier, { confirmed = false } = {}) {
      if (confirmed !== true) throw Object.assign(new Error("deleting model files needs the human's confirmation (confirmed: true)"), { class: "invalid-request", code: "not-confirmed" });
      if (state.load.tier === tier && state.load.state !== "unloaded") await api.unload();
      return runTransfer("remove", tier, async (c, signal) => {
        const res = await c.storage(engineOf(tier), "remove", storageArgs(tier), { signal });
        const after = await c.storage(engineOf(tier), "inspect", storageArgs(tier), { signal });
        state.tiers[tier].install = summarize(after);
        return res;
      });
    },

    /** Startup/re-probe: real load attempts down the main ladder (catalogue tiers only). Leaves the first rung that works loaded. */
    async probe({ humanChoice = state.selection.chosenBy === "human" && state.selection.tier === (catalog.ladderStartTier ?? catalog.defaultTier) ? tiers[state.selection.tier]?.modelId ?? null : null, embedderAttempt = null, rerankerAttempt = null } = {}) {
      const { runProbe } = await import("./capability-probe.mjs");
      const rung = (t, v = null) => { const vi = v ? VARIANT_INFO[v] : null; return { id: vi ? vi.modelId : tiers[t].modelId, tier: t, variant: v, needsF16: vi ? vi.needsF16 : false, peakBytes: (vi ? vi.memory : tiers[t].memory).peakBytes, downloadBytes: vi ? vi.downloadBytes : tiers[t].downloadBytes, installed: state.tiers[t].install.state === "complete" && (!v || v === variant) }; };
      const main = (catalog.ladder?.length ? catalog.ladder : TIER_ORDER.map((tier) => ({ tier }))).map((r) => (r.notCatalogued ? { id: r.id, notCatalogued: true } : rung(r.tier, r.variant ?? null)));
      const ladders = { main };
      if (embedderAttempt) ladders.embedder = [{ id: "memory-embedder", requiresWebGPU: false }];   // the memory loader (engine.js probeEmbedder / createEmbedClient) supplies the real attempt
      if (rerankerAttempt) ladders.reranker = [{ id: "memory-reranker", requiresWebGPU: false }];
      const profile = await runProbe({ ladders, humanChoice, modelSource: globalThis.__cfpModelSource ?? null, attempt: async (name, r) => {
        if (name === "embedder") return embedderAttempt(); if (name === "reranker") return rerankerAttempt();
        if (r.variant && r.variant !== variant) applyVariant(r.variant, "capability probe ladder"); const info = await api.load(r.tier); return { loadMs: info.loadMs };
      } });
      state.profile = profile; emit(); return profile;
    },

    /** The plain event body to record at workspace start (the supervisor/app writes it into the record). */
    profileRecord() { return state.profile ? { kind: "capability-profile", profile: structuredClone(state.profile) } : null; },

    cancelTransfer() { transferController?.abort(); },

    /** A load attempt. Never downloads. Rejects with the typed error and records it in state.load.lastError. */
    async load(tier = state.selection.tier) {
      assertOffered(tier);
      if (state.busy) throw Object.assign(new Error(`cannot load while ${state.busy}`), { class: "provider-unavailable", code: "manager-busy" });
      const attempt = ++loadAttempt;
      state.busy = "load";
      state.load = { state: "loading", tier, loadAttempt: attempt, progress: null, lastError: null, loadedAt: null, loadMs: null, info: null };
      emit();
      const t0 = now();
      try {
        const c = await ensureHost();
        const config = { ...api.tierConfig(tier), loadAttempt: attempt };
        if (!diagnostics && config.knobs) config.knobs = Object.fromEntries(Object.entries(config.knobs).map(([k, v]) => [k, k.startsWith("dev") && k.includes("Diagnostics") ? false : v]));
        const info = await c.load(config, { onProgress: (p) => { state.load.progress = p; emit(false); } });
        state.load = { state: "ready", tier, loadAttempt: attempt, progress: null, lastError: null, loadedAt: now(), loadMs: now() - t0, info: slimInfo(info) };
        state.tiers[tier].install = { ...state.tiers[tier].install, state: "complete", ok: true, checkedAt: now(), verifiedByLoad: true };
        state.lastError = state.lastError?.context === "load" ? null : state.lastError;
        return info;
      } catch (err) {
        const e = { class: err.class || "load-failed", code: err.code || "load-failed", reason: err.reason || null, message: String(err.message), advice: err.advice || classifyEngineError(err, { phase: "load" }).advice, loadAttempt: err.loadAttempt ?? attempt, phase: err.phase || "load", detail: err.detail || null, at: now() };
        state.load = { state: "faulted", tier, loadAttempt: attempt, progress: null, lastError: e, loadedAt: null, loadMs: null, info: null };
        state.lastError = { context: "load", ...e };
        if (e.code === "not-installed" || e.code === "cache-corrupt") {
          state.tiers[tier].install = { ...state.tiers[tier].install, state: e.code === "cache-corrupt" ? "corrupt" : (state.tiers[tier].install.state === "unknown" ? "absent" : state.tiers[tier].install.state), checkedAt: now(), bad: err.detail?.bad ?? [], missingSample: err.detail?.missing ?? [] };
        }
        throw err;
      } finally {
        state.busy = null; emit();
      }
    },

    async unload() {
      const c = client; if (!c || state.host.state !== "running") { state.load = { ...state.load, state: "unloaded", info: null }; emit(); return; }
      const result=await c.unload();
      state.load = { ...state.load, state: "unloaded", progress: null, info: null, loadedAt: null }; emit();
      return result;
    },

    /** After the host died (or any time): a new Worker, nothing loaded. The next load() is a new load attempt. */
    async restartHost() {
      await retireWorkerFully("restart");
      state.host.restarts++;
      state.load = { state: "unloaded", tier: null, loadAttempt: state.load.loadAttempt, progress: null, lastError: null, loadedAt: null, loadMs: null, info: null };
      emit();
      await startWorker();
      return api.getState();
    },

    /** Measure the device again (probes, variant, gate) and reconcile the selection with what is offered now; the gate sees the install state as last inspected. Nothing is loaded, switched or written. */
    async remeasureDevice() { await chooseVariantFromGpu(); await applyGate(); reconcileSelection(); emit(); return api.getState(); },

    async refreshStorage() { return refreshStorage(); },
    async requestPersist() {
      if (!storageManager?.persist) { state.storage.error = "navigator.storage.persist is not available"; emit(); return false; }
      const ok = await storageManager.persist(); state.storage.persisted = ok;
      if (!ok) notice("storage", "The browser declined to mark this storage persistent. The downloaded models can be evicted under disk pressure; the manager will say so on the next check.");
      emit(); return ok;
    },

    /** TEST CONTROL: end the host Worker without telling anyone, as a crash would. Detection must then come from the liveness lock. */
    _testKillHostWorker() { worker?.terminate(); },
    _testClient: () => client,
    _testWorker: () => worker,
    dispose() { retireWorker("dispose"); }
  };

  async function refreshStorage() {
    if (!storageManager?.estimate) { state.storage = { usage: null, quota: null, persisted: null, error: "navigator.storage.estimate is not available", at: now() }; return; }
    const est = await storageManager.estimate();
    let persisted = null; try { persisted = await storageManager.persisted?.(); } catch { /* reported as null */ }
    state.storage = { usage: est.usage ?? null, quota: est.quota ?? null, persisted, error: null, at: now() };
  }

  function slimInfo(info) {
    return { modelId: info.modelId, runtime: info.runtime, adapter: info.adapter, loadAttempt: info.loadAttempt, loadMs: info.loadMs, timings: info.timings || null, capabilities: info.capabilities || null };
  }

  return api;
}
