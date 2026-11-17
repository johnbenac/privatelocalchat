// Deterministic mock engine. Same adapter contract as the real ones, no model, no GPU.
// Provenance: spikes/llm/provider/adapters/mock.js (FAB-02), extended with fault injection and storage ops for the manager's tests.
// Failure injection via the request:  request.mock = { tokenDelayMs, failAfterTokens, failMessage, hangAfterTokens, text, jsonText, prefillMs }
// and via the load config:            config.mock = { failLoad, failLoadMessage, loadSteps, loadStepMs }
export class MockAdapter {
  async load(config, { onProgress }) {
    const steps = config.mock?.loadSteps ?? 3;
    for (let i = 1; i <= steps; i++) { await sleep(config.mock?.loadStepMs ?? 5); onProgress?.({ phase: "mock-load", loaded: i, total: steps }); }
    if (config.mock?.failLoad) throw Object.assign(new Error(config.mock.failLoadMessage || "mock load failure"), { name: "MockLoadError" });
    return {
      modelId: config.modelId || "mock-1", runtime: "mock", context: { contextWindow: 4096 },
      capabilities: { kind: "mock", structuredEnforced: [], structuredValidated: ["json-schema"], structuredEnforcement: { json_schema: "validated", json_object: "validated" }, runtimeName: "mock", runtimeVersion: "1", contextWindowTokens: 4096, maxOutputTokens: 1024 }
    };
  }
  async run(req, signal, emit) {
    const mock = req.mock || {};
    const last = [...req.messages].reverse().find((m) => m.role === "user")?.content || "";
    const text = req.responseFormat?.type === "json_schema" || req.responseFormat?.type === "json_object"
      ? (mock.jsonText ?? '{"intent":"speak","target":"nobody","say":"mock","mood":"calm","confidence":0.5}')
      : (mock.text ?? `mock reply to: ${last.slice(0, 40)}`);
    const pieces = text.match(/\S+\s*/g) || [text];
    emit({ usage: { promptTokens: Math.ceil(req.messages.map((m) => m.content).join(" ").length / 4), cachedPromptTokens: 0 } });
    await sleep(mock.prefillMs ?? 2);
    let n = 0;
    for (const piece of pieces.slice(0, req.maxTokens ?? pieces.length)) {
      if (signal.aborted) return;
      if (mock.failAfterTokens !== undefined && n >= mock.failAfterTokens) throw Object.assign(new Error(mock.failMessage || "mock engine failure"), { name: "MockEngineError" });
      if (mock.hangAfterTokens !== undefined && n >= mock.hangAfterTokens) await new Promise((res) => signal.addEventListener("abort", res, { once: true }));
      if (signal.aborted) return;
      await sleep(mock.tokenDelayMs ?? 1);
      emit({ delta: piece }); n++;
    }
    emit({ usage: { completionTokens: n }, finish: req.maxTokens !== undefined && n >= req.maxTokens && pieces.length > n ? "length" : "stop" });
  }
  async unload() {}
  async stats() { return { runtime: "mock" }; }
}

// A tiny in-memory "cache" so the manager's install/verify/remove can be exercised without a browser cache.
import { compareInventory } from "../verify.mjs";
const stored = new Map();
export const storageOps = {
  async inspect({ files }) { return { ...compareInventory(files, new Map([...stored].filter(([k]) => files.some((f) => f.path === k)))), engine: "mock", where: "memory" }; },
  async verify(args) { return { ...(await storageOps.inspect(args)), deep: !!args.deep, hashMismatch: [] }; },
  async install({ files, damage = [] }, { onProgress }) {
    let done = 0;
    for (const f of files) { if (!stored.has(f.path) || stored.get(f.path) !== f.bytes) stored.set(f.path, damage.includes(f.path) ? 0 : f.bytes); onProgress?.({ phase: "install", bytesDone: (done += f.bytes), bytesTotal: files.reduce((n, x) => n + x.bytes, 0), filesDone: 1, filesTotal: files.length }); }
    return { ...(await storageOps.inspect({ files })), fetchedBytes: done, keptBytes: 0, replaced: [] };
  },
  async repair(args, hooks) { for (const f of args.files) if (stored.get(f.path) !== f.bytes) stored.delete(f.path); return storageOps.install(args, hooks); },
  async remove({ files }) { for (const f of files) stored.delete(f.path); return { removed: files.length }; },
  __stored: stored
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
