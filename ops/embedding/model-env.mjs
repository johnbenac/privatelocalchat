// What the embedding worker tells transformers.js about where the model files and the ONNX Runtime WASM are.
//
// Same origin as the worker: the files are local files at an absolute PATH (transformers.js 4.x skips its local-file check for an absolute
// http(s) localModelPath and reports the model missing, so a URL cannot be given there).
// Another origin (the asset CDN): the library's remote loader is pointed at that base with no revision in the path, because the CDN path is
// itself the content-addressed version. The files are plain cross-origin GETs (the CDN sets CORS and CORP).

export function embeddingEnv({ modelBase, wasmBase, workerOrigin }) {
  const base = new URL(modelBase);
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error(`modelBase must be an http(s) URL, got ${modelBase}`);
  if (!base.pathname.endsWith("/")) throw new Error(`modelBase must end with "/", got ${modelBase}`);
  const wasm = new URL(wasmBase);
  const wasmPaths = { mjs: new URL("ort-wasm-simd-threaded.mjs", wasm).href, wasm: new URL("ort-wasm-simd-threaded.wasm", wasm).href };
  if (base.origin === workerOrigin) return { allowLocalModels: true, allowRemoteModels: false, localModelPath: base.pathname, wasmPaths };
  return { allowLocalModels: false, allowRemoteModels: true, remoteHost: base.href, remotePathTemplate: "{model}/", wasmPaths };
}
