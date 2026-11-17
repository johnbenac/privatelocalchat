// Local QR codes. The encoder is a file of this app (chat/vendor/qrcode.js) loaded on first use: nothing is fetched from anywhere else, and
// the text being encoded never leaves the page.

// Byte-mode capacity of the largest symbol (version 40) for each error-correction level.
const CAPACITY_BYTES = Object.freeze({ L: 2953, M: 2331, Q: 1663, H: 1273 });
export const qrCapacity = (level = "M") => CAPACITY_BYTES[level] ?? 0;
export const fitsQr = (text, level = "M") => new TextEncoder().encode(String(text)).length <= qrCapacity(level);

let loading = null;
/** Loads the encoder once. `base` is where chat/vendor/qrcode.js lives (this module's own folder by default, so release paths resolve). */
export function loadQrLibrary(base = import.meta.url) {
  if (globalThis.QRCode) return Promise.resolve(globalThis.QRCode);
  loading ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("../vendor/qrcode.js", base).href;
    script.onload = () => (globalThis.QRCode ? resolve(globalThis.QRCode) : reject(new Error("The QR code encoder did not start.")));
    script.onerror = () => { loading = null; reject(new Error("The QR code encoder could not be loaded.")); };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Draws `text` as a QR code in `container`. Rejects with code "qr-too-large" (nothing drawn) when it would not fit, so the caller can
 * offer the other ways to carry the same text instead.
 */
export async function renderQr(container, text, { level = "M", size = 240, dark = "#000000", light = "#ffffff", base } = {}) {
  if (!fitsQr(text, level)) throw Object.assign(new Error("This is too long to fit in a QR code."), { code: "qr-too-large" });
  const QRCode = await loadQrLibrary(base);
  container.textContent = "";
  new QRCode(container, { text, width: size, height: size, colorDark: dark, colorLight: light, correctLevel: QRCode.CorrectLevel[level] });
  // the encoder draws a canvas and a copy as an image; keep one, described for assistive technology
  const canvas = container.querySelector("canvas"), img = container.querySelector("img");
  if (img && canvas) canvas.remove();
  return container;
}
