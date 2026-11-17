// Which on-device model should this device use, without asking anyone? Phones and tablets get the small model; a capable desktop gets
// the larger one. A model that is already downloaded, or one the person chose, always wins. null means no model can run here.

const MOBILE = /iPhone|iPad|iPod|Android/;
export const isMobileDevice = (userAgent = "", maxTouchPoints = 0) => MOBILE.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

const IOS = /iPhone|iPad|iPod/;
// models run by the wllama engine (the same runtime and processor fallback); LFM2.5 and Granite are chosen by the person, never picked for them
const WLLAMA = new Set(["light", "lfm", "granite", "mini", "nano"]);
// the tiny models: a few hundred megabytes in memory, so they can run on the processor where the larger ones cannot (iPhone and iPad, phones with little memory)
const TINY = new Set(["mini", "nano"]);

/**
 * Can a model run on the processor (WebAssembly) instead of a graphics card? Same model, same files: only where the maths happens
 * changes, so it is slower. The 2B models are not offered on iPhone and iPad, where the browser kills a page that holds that much memory
 * (docs/IPHONE-INVESTIGATION.md), nor where WebAssembly SIMD is missing or the device reports under 4 GB. The tiny models (`tier` mini or nano) are
 * small enough for iPhone and iPad and for a device that reports 2 GB.
 */
export function cpuBackendSupport({ env, userAgent = "", maxTouchPoints = 0, tier = "light" }) {
  const tiny = TINY.has(tier);
  const wasm = env?.wasm;
  if (!wasm?.available) return { ok: false, reason: "no-wasm" };
  if (wasm.simd === false) return { ok: false, reason: "no-simd" };
  if (!tiny && (IOS.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1))) return { ok: false, reason: "ios-memory-limit" };
  if (env.deviceMemoryGB != null && env.deviceMemoryGB < (tiny ? 2 : 4)) return { ok: false, reason: "low-memory" };
  return { ok: true, reason: "cpu" };
}

/**
 * How much memory an Apple phone has, when the browser will not say (iOS gives no deviceMemory). Apple sets the GPU's largest buffer from the device's memory:
 * a 4 GB iPhone (an 11 Pro, even on a new iOS) reports 715,827,880 bytes, one sixth of 4 GiB. Larger phones report 1 GiB or more, where the limit stops telling
 * them apart, so those are not guessed at. null when this is not an Apple GPU or the phone is in the larger class. It never looks at the OS version.
 */
export function appleMemoryEstimateGB(env) {
  const w = env?.webgpu;
  if (!w?.available || String(w.adapter?.vendor || "").toLowerCase() !== "apple" || !(w.maxBufferSize > 0) || w.maxBufferSize >= 1_000_000_000) return null;
  return Math.round(((w.maxBufferSize * 6) / 2 ** 30) * 2) / 2;
}
/** A phone or tablet whose memory (by that estimate) is too small for the 2B model: it gets the tiny model, on the processor, which is what is proven to fit. */
export const lowMemoryApple = (env) => { const gb = appleMemoryEstimateGB(env); return gb != null && gb < 6; };

/** Can the graphics card run the small (2B) model? It needs a real GPU with 16-bit shaders. */
export const gpuRunsLight = (env) => Boolean(env?.webgpu?.available && !env.webgpu.isFallbackAdapter && env.webgpu.shaderF16);

/** Where a model runs on this device: "gpu" when the graphics card can, else "cpu" when that is possible for that model, else "gpu" (the load will say what is missing). */
export function tierBackend({ env, userAgent = "", maxTouchPoints = 0, tier = "light" }) {
  if (TINY.has(tier) && lowMemoryApple(env) && cpuBackendSupport({ env, userAgent, maxTouchPoints, tier }).ok) return "cpu"; // a small iPhone runs the tiny models on its processor, not on a card that shares its memory
  if (gpuRunsLight(env)) return "gpu";
  return cpuBackendSupport({ env, userAgent, maxTouchPoints, tier }).ok ? "cpu" : "gpu";
}
/** Where the small (2B) model runs on this device. */
export const lightBackend = (args) => tierBackend({ ...args, tier: "light" });

export function pickTier({ env, installed = {}, selection = {}, userAgent = "", maxTouchPoints = 0 }) {
  const gpu = env?.webgpu || {};
  const cpuOk = (tier) => cpuBackendSupport({ env, userAgent, maxTouchPoints, tier }).ok; // can this model run on the processor here?
  const mobile = isMobileDevice(userAgent, maxTouchPoints);
  // no usable graphics card: the processor, if the device can
  if (!gpu.available || gpu.isFallbackAdapter) {
    // a model the person chose (or already has) keeps its place on the processor when that model can run there
    const chosen = WLLAMA.has(selection.tier) && cpuOk(selection.tier) && (selection.chosenBy === "human" || installed[selection.tier]) ? selection.tier : null;
    if (chosen) return { tier: chosen, backend: "cpu", reason: "chosen-cpu" };
    const have = ["light", "lfm", "granite", "mini", "nano"].filter((t) => installed[t] && cpuOk(t));
    if (have.length) return { tier: have[0], backend: "cpu", reason: "installed-cpu" };
    // where the browser's file storage cannot be opened the model lives in memory, and the 223 MB one froze an iPhone 11 Pro: the 105 MB one is the default there
    if (env?.opfs === false && cpuOk("nano")) return { tier: "nano", backend: "cpu", reason: "no-opfs-tiny" };
    // a phone or tablet without a graphics card is better served by the tiny model than by a 2B model on its processor (slow, and 2 GB of memory)
    if (mobile && cpuOk("mini")) return { tier: "mini", backend: "cpu", reason: "mobile-cpu-tiny" };
    if (cpuOk("light")) return { tier: "light", backend: "cpu", reason: "no-gpu-cpu" };
    if (cpuOk("mini")) return { tier: "mini", backend: "cpu", reason: "no-gpu-cpu-tiny" };
    return { tier: null, reason: "no-gpu" };
  }
  const f16 = Boolean(gpu.shaderF16);
  const supports = { light: f16, lfm: f16, granite: f16, mini: f16, nano: f16, default: true }; // the larger model has a build that works without 16-bit shaders
  const roomForLarge = !mobile && (env.deviceMemoryGB == null || env.deviceMemoryGB >= 8);
  const ok = (t) => supports[t] && (t !== "default" || roomForLarge || installed.default || selection.chosenBy === "human");
  const withBackend = (t, reason) => (WLLAMA.has(t) && !supports[t] ? { tier: t, backend: "cpu", reason } : { tier: t, reason });
  const runs = (t) => ok(t) || (WLLAMA.has(t) && cpuOk(t));
  if (selection.chosenBy === "human" && selection.tier && runs(selection.tier)) return withBackend(selection.tier, "chosen");
  const have = ["light", "lfm", "granite", "mini", "nano", "default"].filter((t) => installed[t] && runs(t));
  if (have.length) { const t = have.includes(selection.tier) ? selection.tier : have[0]; return withBackend(t, "installed"); }
  if (roomForLarge && supports.default) return { tier: "default", reason: "desktop" };
  // a phone with about 4 GB (an iPhone 11 Pro, whatever its iOS) starts with the tiny model: the 2B one is 1.2 GB and the browser ends a page that holds that much there
  if (mobile && lowMemoryApple(env) && cpuOk("mini")) return { tier: "mini", backend: "cpu", reason: "low-memory-phone" };
  if (supports.light) return { tier: "light", reason: mobile ? "mobile" : "small-device" };
  if (cpuOk("light")) return { tier: "light", backend: "cpu", reason: "no-f16-cpu" };
  if (cpuOk("mini")) return { tier: "mini", backend: "cpu", reason: "no-f16-cpu-tiny" };
  return { tier: null, reason: "no-f16-and-no-room" };
}
