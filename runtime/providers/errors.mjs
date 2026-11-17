// Typed provider errors for the production host (FAB-07p). Pure: no DOM, testable in Node.
//
// The classes are the contract's (contracts/fabric/schemas/provider/provider-error.schema.json). The host never retries and
// never falls back to another model: every failure here is reported with its raw engine message AND plain advice for the human.
// `advice` is for the model manager UI; it is not part of the contract's ProviderError (which has no such field), so the mind
// adapter puts the raw message in ProviderError.message and may append the advice.

export const ERROR_CLASSES = Object.freeze(["provider-unavailable", "load-failed", "out-of-memory", "context-overflow", "output-invalid", "unsupported", "runtime-fault", "invalid-request", "aborted"]);

const LIGHT_TIER_HINT = "If this keeps happening you can choose the Light tier in Settings > Models. The app will never switch models by itself.";

const RULES = [
  // WebGPU missing: neither engine can run without it
  { re: /webgpu.*(not (supported|available)|unavailable|disabled)|no (suitable )?(gpu )?adapter|navigator\.gpu (is )?(undefined|missing)|requestAdapter.*null/i,
    cls: "provider-unavailable", code: "webgpu-unavailable", reason: "webgpu-unavailable", providerFault: false,
    advice: "This browser did not give the page a WebGPU device, and both model tiers need one. Use Safari 26 or newer (or a current Chrome) on a Mac with a supported GPU, and check that WebGPU is not disabled in the browser's feature flags." },
  // the cache holds something different from what the catalogue says (checked first: a precise statement beats a vague one)
  { re: /exceeds shard size|Tensor-cache record range|cache-corrupt|cache-incomplete|size mismatch|checksum mismatch/i,
    cls: "load-failed", code: "cache-corrupt", reason: "cache-corrupt", providerFault: false,
    advice: "A model file stored in this browser does not match what was downloaded (an interrupted download, or the browser's storage changed). Open Settings > Models and press Repair: it removes only the bad files and downloads them again." },
  { re: /not-installed/i, cls: "load-failed", code: "not-installed", reason: "not-installed", providerFault: false,
    advice: "The model is not downloaded to this browser yet. Open Settings > Models and press Download." },
  // memory
  { re: /out of memory|\bOOM\b|Out of bounds memory access|GPUOutOfMemoryError|Failed to allocate|Array buffer allocation failed|createBuffer.*(fail|size|limit|exceed)|maxBufferSize|RangeError.*(allocation|array length|Invalid array)/i,
    cls: "out-of-memory", code: "out-of-memory", reason: "out-of-memory", providerFault: true,
    advice: "The browser ran out of memory for this model (the default model needs about 6 GB, up to 9 GB at peak). Close other tabs and heavy apps, then load again. " + LIGHT_TIER_HINT },
  // a runtime object the engine still needs was disposed (WebLLM/TVM: "The current Object has already been disposed"): the engine's state is broken, but a
  // fresh load of the same model fixes it, so the host does that itself, as a new recorded load attempt
  { re: /has already been disposed/i,
    cls: "runtime-fault", code: "engine-disposed", reason: "engine-disposed", providerFault: true, recoverable: true,
    advice: "The model engine used something it had already released, so it was reloaded. The attempt that hit it failed and was not retried; ask again." },
  // device lost, wasm trap, engine abort: the engine is no longer trustworthy
  { re: /device.*lost|lost.*device|GPUDevice|context lost|RuntimeError|unreachable|memory access out of bounds|abort\(|Aborted\(/i,
    cls: "runtime-fault", code: "provider-fault", reason: "engine-fault", providerFault: true,
    advice: "The model engine failed and was stopped. Nothing was retried. Restart the model host in Settings > Models (this is a new load attempt). " },
  { re: /Failed to fetch|NetworkError|Load failed|network connection|HTTP \d{3}|ERR_[A-Z_]+|download/i,
    cls: "load-failed", code: "download-failed", reason: "download-failed", providerFault: false,
    advice: "Fetching a model file failed. Check the connection and press Download again: files that are already complete are kept and only the missing ones are fetched." },
];

/** Classify an engine/host error. `phase` is "load" | "generate" | "install". Returns a plain, cloneable description. */
export function classifyEngineError(err, { phase = "generate" } = {}) {
  const message = String(err?.message ?? err ?? "unknown error");
  const name = String(err?.name ?? "Error");
  const probe = `${name}: ${message}`;
  // Safari's generic wording for a storage call that failed ("unknown transient reason (e.g. out of memory)"). While saving or checking files it means the
  // browser would not give the page a place to keep them (Private Browsing, a restricted browser, a full disk), not that the model needs too much RAM.
  if ((phase === "install" || phase === "inspect" || phase === "load") && /unknown transient reason/i.test(probe)) {
    return { class: "load-failed", code: "storage-unavailable", reason: "storage-unavailable", providerFault: false, recoverable: false, message, name,
      advice: "This browser would not give the page a place to save files. On iPhone and iPad that usually means Private Browsing or a restricted browser: open the app in a normal Safari tab and try again. If the device is nearly full, free some space first. Or use a connected provider, which needs no storage." };
  }
  for (const rule of RULES) {
    if (rule.re.test(probe)) {
      // a generic "download" or fault rule applied to a generation is still a fault, never a load problem
      const cls = phase === "generate" && rule.cls === "load-failed" ? "runtime-fault" : rule.cls;
      const code = phase === "generate" && rule.cls === "load-failed" ? "provider-fault" : rule.code;
      return { class: cls, code, reason: rule.reason, providerFault: rule.providerFault || phase === "generate" && rule.cls === "load-failed", recoverable: rule.recoverable === true, advice: rule.advice, message, name };
    }
  }
  if (phase === "load" || phase === "install") {
    return { class: "load-failed", code: "load-failed", reason: "unknown", providerFault: false, message, name, advice: "Loading the model failed for a reason the app does not recognise. The raw message is shown above. Press Load to make a new attempt, or Verify to check the downloaded files." };
  }
  // An unrecognised exception during one generation: that attempt failed, loudly, with the raw message. The engine is not declared
  // faulted (WebLLM throws ordinary errors for bad parameters); a new attempt is allowed. Known fault signatures are matched above.
  return { class: "runtime-fault", code: "engine-error", reason: "unknown", providerFault: false, message, name, advice: "The model engine reported an error the app does not recognise; the raw message is kept. Nothing was retried. The mind may try again as a new attempt." };
}

/** The host Worker died (crashed, killed, or its liveness lock was released). The raw message is kept verbatim. */
export function hostDiedError(rawMessage, { how = "unknown" } = {}) {
  const message = String(rawMessage || "the inference host Worker is gone");
  return {
    class: "runtime-fault", code: "provider-fault", reason: "host-died", how, providerFault: true, message, name: "HostWorkerDied",
    advice: "The model host Worker stopped unexpectedly, so the loaded model is gone and anything it was generating failed. Nothing was retried. Press Restart in Settings > Models to start a new host and load the model again (a new load attempt)."
  };
}

/** Terminal event error -> the fields of a contract ProviderError (class, message, detail). `advice` is returned separately. */
export function toProviderErrorFields(error, partialText = "") {
  const cls = ERROR_CLASSES.includes(error?.class) ? error.class : (error?.providerFault ? "runtime-fault" : "runtime-fault");
  const detail = {};
  const phase = error?.phase === "queued" ? "queue" : error?.phase === "structured" ? "validate" : error?.phase;
  if (["queue", "load", "prefill", "decode", "validate"].includes(phase)) detail.phase = phase;
  if (cls === "context-overflow") {
    if (Number.isInteger(error?.detail?.neededTokens)) detail.neededTokens = error.detail.neededTokens;
    if (Number.isInteger(error?.detail?.availableTokens)) detail.availableTokens = error.detail.availableTokens;
  }
  if (cls === "output-invalid") detail.rawOutputChars = String(partialText).length;
  return { class: cls, message: String(error?.message || "the generation failed"), ...(Object.keys(detail).length ? { detail } : {}), advice: error?.advice ?? null };
}

// wllama: "request (5024 tokens) exceeds the available context size (4096 tokens)"; WebLLM (ContextWindowSizeExceededError):
// "Prompt tokens exceed context window size: number of prompt tokens: 4625; context window size: 4096".
// Both engines reject an over-long prompt up front, report its exact length and stay healthy; nothing is truncated.
export function parseOverflow(message, err) {
  const text = String(message ?? "");
  let m = /request \((\d+) tokens\) exceeds the available context size \((\d+) tokens\)/i.exec(text);
  if (m) return { neededTokens: Number(m[1]), availableTokens: Number(m[2]) };
  m = /number of prompt tokens: (\d+); context window size: (\d+)/i.exec(text);
  if (m) return { neededTokens: Number(m[1]), availableTokens: Number(m[2]) };
  if (err?.name === "ContextWindowSizeExceededError") return { neededTokens: null, availableTokens: null };
  return null;
}

export function serializeError(err) {
  return { name: err?.name || "Error", message: String(err?.message || err).slice(0, 800), code: err?.code || null, stack: String(err?.stack || "").slice(0, 1500) };
}

/** Conservative token estimate for budgets (the engines' own rejection stays authoritative; tokenisers differ by ~10 %). */
export function estimateTokens(messages) {
  let chars = 0;
  for (const m of messages || []) chars += String(m?.content ?? m?.text ?? "").length;
  const n = (messages || []).length;
  return { tokens: Math.ceil(chars / 3.4) + 6 * n + 4, exact: false };
}
