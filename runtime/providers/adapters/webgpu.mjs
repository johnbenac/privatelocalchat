// WebGPU preflight shared by both engines. A missing WebGPU device is a clear typed error with advice (errors.mjs), never a fallback
// to another model or engine.
export async function preflight() {
  if (typeof navigator === "undefined" || !navigator.gpu) throw Object.assign(new Error("WebGPU is not available: navigator.gpu is undefined in this context"), { name: "WebGpuUnavailable" });
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter(); } catch (e) { throw Object.assign(new Error(`WebGPU is not available: requestAdapter threw ${e?.message || e}`), { name: "WebGpuUnavailable" }); }
  if (!adapter) throw Object.assign(new Error("WebGPU is not available: requestAdapter() returned no adapter"), { name: "WebGpuUnavailable" });
}
