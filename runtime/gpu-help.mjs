// Turn what the browser reported about WebGPU into a plain explanation and the next things to try. Pure, so every case is tested.
// kind: ok | no-api | no-adapter | software | no-f16

const browserOf = (ua = "") => /Firefox\//.test(ua) ? "firefox" : /Edg\//.test(ua) ? "edge" : /(Chrome|Chromium|CriOS)\//.test(ua) ? "chromium" : /Safari\//.test(ua) ? "safari" : "other";
const platformOf = (env) => { const t = `${env.platform || ""} ${env.userAgent || ""}`; return /Android/i.test(t) ? "android" : /iPhone|iPad|iPod/.test(t) ? "ios" : /Linux|X11/i.test(t) ? "linux" : /Mac/i.test(t) ? "mac" : /Win/i.test(t) ? "windows" : "other"; };
const adapterName = (a) => (a ? [a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(" ") : "");

export function explainGpu(env, { tier = "light" } = {}) {
  const w = env?.webgpu || {};
  const browser = browserOf(env?.userAgent), platform = platformOf(env || {});
  const headless = /HeadlessChrome/i.test(env?.userAgent || "");
  const common = headless ? ["This looks like a headless browser. Headless and remote sessions usually have no GPU. Open the app in a normal desktop window."] : [];
  const linuxVulkan = [
    "Open chrome://gpu and read the WebGPU and Vulkan lines: they say whether the browser found your graphics card.",
    "On Linux, WebGPU needs Vulkan. Check that `vulkaninfo --summary` lists your GPU (for NVIDIA, install the proprietary driver and its Vulkan files).",
    "Start the browser with `--enable-unsafe-webgpu --enable-features=Vulkan`, or turn on “Unsafe WebGPU Support” and “Vulkan” in chrome://flags, then reload."
  ];
  if (w.available && w.isFallbackAdapter) {
    return { kind: "software", headline: "The browser only found a software renderer, not your graphics card.", detail: `It reported ${adapterName(w.adapter) || "a fallback adapter"}, which runs on the CPU and is too slow for these models.`, steps: [...common, ...(browser === "firefox" ? ["Try Chrome or Chromium, which support WebGPU on Linux and Windows today."] : linuxVulkan)], adapter: adapterName(w.adapter) };
  }
  if (w.available && !w.shaderF16) {
    const big = tier !== "default";
    return { kind: "no-f16", headline: big ? "This graphics card is available, but the browser does not offer the 16-bit shader support the on-device model needs." : "", detail: `${adapterName(w.adapter) ? adapterName(w.adapter) + " was found. " : ""}${big ? "The larger 9B model has a build that works without it, if this device has enough memory (about 8 GB or more of graphics memory)." : ""}`.trim(), steps: [...common, "Update the graphics driver, then restart the browser (on NVIDIA/Linux the Vulkan driver must expose 16-bit float support).", ...(platform === "linux" && /nvidia/i.test(adapterName(w.adapter) || w.adapter?.vendor || "") ? ["Chrome and Chromium keep 16-bit shaders switched off for NVIDIA's Vulkan driver on Linux, even when the driver supports them. Start the browser with --enable-dawn-features=vulkan_enable_f16_on_nvidia (together with --enable-unsafe-webgpu and --enable-features=Vulkan if they are not already on). On an NVIDIA GB10 this made the 350M model run on the graphics card."] : []), ...(big ? ["Choose the 9B model under Model and connection, or use a connected provider."] : [])], adapter: adapterName(w.adapter) };
  }
  if (w.available) return { kind: "ok", headline: "", detail: "", steps: [], adapter: adapterName(w.adapter) };
  if (w.hasApi === false) {
    const steps = browser === "firefox"
      ? [...common, "Firefox does not turn WebGPU on by default in its stable release on Linux. Use Chrome or Chromium instead.", "To try Firefox anyway: use Firefox Nightly and set dom.webgpu.enabled to true in about:config, then restart."]
      : browser === "safari" ? [...common, "Update Safari. WebGPU is available in recent versions (iOS and macOS 26 and later)."]
      : [...common, ...(platform === "linux" ? linuxVulkan : ["Update the browser to its latest version.", "Open chrome://gpu and check the WebGPU line."])];
    const why = env?.secureContext === false ? "This page is not in a secure context, so the browser hides WebGPU." : browser === "firefox" ? "This Firefox build does not offer WebGPU." : "This browser does not offer WebGPU.";
    return { kind: "no-api", headline: "WebGPU is not available in this browser.", detail: why, steps, adapter: "" };
  }
  return { kind: "no-adapter", headline: "The browser supports WebGPU but could not find a usable graphics card.", detail: (w.reason ? w.reason + ". " : "") + (w.softwareAdapterExists ? "Only a software renderer exists." : ""), steps: [...common, ...(browser === "firefox" ? ["Check that your graphics driver is current. If Firefox is the problem, try Chrome or Chromium."] : platform === "linux" ? linuxVulkan : ["Update your graphics driver and restart the browser.", "Open chrome://gpu and check the WebGPU line."])], adapter: "" };
}
