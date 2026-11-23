// The `load` config each shipped engine's adapter takes, built from facts passed in. Pure: no configuration, no window global. catalog-tiers.mjs (the original catalogue) and
// catalog-core.mjs (a catalogue made from manifests) both build their configs here, so one code path produces them and a test can prove the two agree.
const MiB = 1 << 20;

export function webllmLoadConfig({ tier, variant, variantInfo, info, files, modelBase, modelLib }) {
  return {
    adapter: "webllm", tier, variant, modelId: variantInfo.modelId, modelBase, modelLib,
    contextWindow: info.contextWindowTokens, quantization: variantInfo.quantization, license: info.license, files
  };
}

/** "cpu": the same model and files, computed by the processor through WebAssembly (no WebGPU at all). Slower, and it keeps the whole model in WebAssembly memory instead of the graphics card. */
export function wllamaLoadConfig({ tier, info, files, runtimeDir = null, backend = "gpu", buildId, nBatch = 128, nUbatch = 32, extraContext = {} }) {
  // the build id names the runtime build the adapter must find: it is catalogue data (a consumer states its own), never a default of the package
  if (typeof buildId !== "string" || !buildId) throw new TypeError(`tier ${tier}: a wllama load config needs buildId (the runtime build this catalogue ships)`);
  const cpu = backend === "cpu";
  return {
    adapter: "wllama", tier, backend: cpu ? "cpu" : "gpu", modelId: info.modelId, modelUrl: files[0].url, quantization: info.quantization, license: info.license, files,
    runtime: { dir: runtimeDir, buildId, cls: "compat" },
    context: {
      // Keep the full conversation window; bound temporary prefill graphs separately.
      // The non-flash-attention path used on iPhone otherwise reserves ~94 MiB at 512.
      n_ctx: info.contextWindowTokens, n_batch: nBatch, n_ubatch: nUbatch, flash_attn_policy: -1, n_gpu_layers: cpu ? 0 : -1,
      // engine- or model-specific kernels (the fused gated-delta-net kernels are Qwen3.5's; the other models do not have that layer)
      ...extraContext,
      sched_max_splits_hint: 128, ctx_checkpoints: 1, checkpoint_every_n_tokens: 64, checkpoint_clear_policy: "replace-on-reset-and-terminate"
    },
    knobs: { initialMemoryMiB: 128, offloadTiedEmbedding: !cpu, progressiveSourceRelease: true, recycleWindowBytes: 96 * MiB }
  };
}
export const QWEN35_EXTRA_CONTEXT = Object.freeze({ fused_gdn_auto: true, fused_gdn_ar: true, fused_gdn_ch: true });
