// The browser worker entry, bundled by ops/embedding/build-worker.mjs into chat/vendor/embedding/worker.js.
// Protocol: { id, op: "init" | "embedDocuments" | "embedQuery", ... } -> { id, ok: true, ... } | { id, ok: false, error }.
// Every failure is posted with its message; nothing is swallowed. The model files and the WASM runtime come from config.modelBase and
// config.wasmBase (chat/embedding/embedding-config.mjs). The worker script itself must be same-origin.
// The text of a query is embedded here, on the device; the only network traffic is the one-time download of the model files.

import * as transformers from "@huggingface/transformers";
import { createEngine } from "./engine.mjs";
import { embeddingEnv } from "./model-env.mjs";

let engine = null;

function configure(c) {
  const { env } = transformers;
  const where = embeddingEnv({ modelBase: c.modelBase, wasmBase: c.wasmBase, workerOrigin: self.location.origin });
  // The browser Cache API keeps the model files (and the WASM runtime) after the first download, so a reload or an offline visit does not
  // fetch them again. transformers.js uses it for both by default; it is stated here so that nobody switches it off by accident.
  env.useBrowserCache = true;
  env.useWasmCache = true;
  env.allowLocalModels = where.allowLocalModels;
  env.allowRemoteModels = where.allowRemoteModels;
  if (where.localModelPath !== undefined) env.localModelPath = where.localModelPath;
  if (where.remoteHost !== undefined) { env.remoteHost = where.remoteHost; env.remotePathTemplate = where.remotePathTemplate; }
  // the plain CPU WASM build (12.9 MB), not the JSEP/asyncify builds (WebGPU) the default would ask for (24 to 26 MB each)
  env.backends.onnx.wasm.wasmPaths = where.wasmPaths;
  env.backends.onnx.wasm.numThreads = 1; // one small model: no thread pool, no extra memory
  env.backends.onnx.wasm.proxy = false;
}

self.onmessage = async ({ data }) => {
  const reply = (payload) => self.postMessage({ id: data.id, ...payload });
  try {
    if (data.op === "init") {
      configure(data.config);
      engine = createEngine({ transformers, device: "wasm" });
      await engine.init();
      return reply({ ok: true, id_model: engine.id, timings: engine.timings });
    }
    if (!engine) throw new Error("the embedding worker was not initialised");
    if (data.op === "embedDocuments") return reply({ ok: true, vectors: (await engine.embedDocuments(data.texts)).map((v) => [...v]) });
    if (data.op === "embedQuery") return reply({ ok: true, vector: [...(await engine.embedQuery(data.text))] });
    throw new Error(`unknown embedding op ${data.op}`);
  } catch (error) {
    reply({ ok: false, error: String(error?.message ?? error), name: error?.name, stack: String(error?.stack ?? "").slice(0, 1500) });
  }
};
