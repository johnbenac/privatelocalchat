// Share Private Local Chat: recommend the public app to someone. The payload is fixed. It is never built from the current address,
// a conversation, settings, credentials or an imported transfer, so nothing private can end up in it.
import { renderQr } from "./qr.mjs";
import { siteLinks } from "../site/site-links.mjs";

export const PRODUCT = Object.freeze({
  /** The public address of the site that serves this copy (the site manifest, chat/site/site-links.mjs), or null: a copy that names no site has nothing to share. */
  get url() { return siteLinks().site?.url ?? null; },
  title: "Private Local Chat",
  text: "Free AI chat in your browser. Run a supported model on your device, or choose an outside provider."
});
export const PANEL_COPY = "Share Private Local Chat with someone who might find it useful. This shares the public app address. Your conversations and settings stay on your device.";

/** A fresh copy of the fixed public payload for navigator.share. */
export const shareData = (address = PRODUCT.url) => ({ url: address, title: PRODUCT.title, text: PRODUCT.text });

export function canShareNatively(nav = globalThis.navigator, address = PRODUCT.url) {
  if (typeof nav?.share !== "function") return false;
  try { return typeof nav.canShare !== "function" || nav.canShare(shareData(address)); } catch { return false; }
}

/**
 * Hands the public payload to the device's sharing interface. Call it straight from the click handler: browsers only allow sharing
 * inside the user's gesture, so nothing is awaited before it. Resolves "shared" (handed over), "dismissed" (the person closed the sheet;
 * not an error), "unavailable" or "error".
 */
export function shareProduct(nav = globalThis.navigator, address = PRODUCT.url) {
  if (!address || !canShareNatively(nav, address)) return Promise.resolve("unavailable");
  let pending;
  try { pending = nav.share(shareData(address)); } catch (error) { return Promise.resolve(error?.name === "AbortError" ? "dismissed" : "error"); }
  return Promise.resolve(pending).then(() => "shared", (error) => (error?.name === "AbortError" ? "dismissed" : "error"));
}

/** Writes the public link to the clipboard. Resolves "copied" or "manual" (the person has to copy the shown address themselves). */
export async function copyProductLink({ nav = globalThis.navigator, doc = globalThis.document, field = null, address = PRODUCT.url } = {}) {
  try {
    if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(address); return "copied"; }
  } catch { /* fall through to the selectable address */ }
  try {
    if (field && doc?.execCommand) { field.focus(); field.select(); if (doc.execCommand("copy")) return "copied"; }
  } catch { /* nothing more to try */ }
  return "manual";
}

const el = (doc, tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

/**
 * The product-share panel, used in the app's Share dialog and on the public About and Help pages: Share (where the device offers it),
 * Copy link (the main action where it does not) and Show QR code. Returns { destroy, element }.
 */
export function mountProductShare(container, { doc = globalThis.document, nav = globalThis.navigator, onToast = () => {}, qrColors = () => ({}), shareAddress = PRODUCT.url } = {}) {
  if (!shareAddress) return { element: null, destroy() {} }; // a copy that names no site has no public address to share
  const root = el(doc, "div", "product-share");
  const copy = el(doc, "p", "product-share-copy", PANEL_COPY);
  const actions = el(doc, "div", "product-share-actions");
  const native = canShareNatively(nav, shareAddress);
  const button = (label, id, primary) => { const b = el(doc, "button", primary ? "primary" : "secondary", label); b.type = "button"; b.id = id; return b; };
  const shareBtn = native ? button("Share", "productShareBtn", true) : null;
  const copyBtn = button("Copy link", "productCopyBtn", !native);
  const qrBtn = button("Show QR code", "productQrBtn", false); qrBtn.setAttribute("aria-expanded", "false");
  actions.append(...[shareBtn, copyBtn, qrBtn].filter(Boolean));
  const status = el(doc, "p", "product-share-status"); status.setAttribute("role", "status");
  const addressLabel = el(doc, "label", "product-share-address-label", "Address"); addressLabel.htmlFor = "productShareAddress";
  const address = el(doc, "input", "product-share-address"); address.id = "productShareAddress"; address.type = "text"; address.readOnly = true; address.value = shareAddress;
  address.addEventListener("focus", () => address.select());
  const manual = el(doc, "div", "product-share-manual"); manual.append(addressLabel, address);
  manual.hidden = Boolean(nav?.clipboard?.writeText); // selectable when the clipboard is not available
  const qrBox = el(doc, "div", "product-share-qr"); qrBox.hidden = true;
  const qrImage = el(doc, "div", "product-share-qr-image"); qrImage.setAttribute("role", "img"); qrImage.setAttribute("aria-label", "QR code for " + shareAddress);
  const qrDestination = el(doc, "p", "product-share-destination", shareAddress);
  qrBox.append(qrImage, qrDestination);
  root.append(copy, actions, status, manual, qrBox);
  container.appendChild(root);

  const say = (text) => { status.textContent = text; };
  shareBtn?.addEventListener("click", () => {
    // no await before the share call: the browser requires it inside the click
    shareProduct(nav, shareAddress).then((outcome) => {
      if (outcome === "shared") say("Shared.");
      else if (outcome === "dismissed") say(""); // closing the sheet is a finished action, not an error
      else { say("Sharing is not available here. Copy the link instead."); manual.hidden = false; }
    });
  });
  copyBtn.addEventListener("click", async () => {
    const outcome = await copyProductLink({ nav, doc, field: address, address: shareAddress });
    if (outcome === "copied") { say("Link copied"); onToast("Link copied"); }
    else { manual.hidden = false; say("Copy this address: select it and copy."); address.focus(); address.select(); }
  });
  qrBtn.addEventListener("click", async () => {
    const open = qrBox.hidden;
    if (!open) { qrBox.hidden = true; qrBtn.setAttribute("aria-expanded", "false"); qrBtn.textContent = "Show QR code"; return; }
    qrBtn.setAttribute("aria-busy", "true");
    try {
      await renderQr(qrImage, shareAddress, { level: "Q", size: 220, ...qrColors() });
      qrBox.hidden = false; qrBtn.setAttribute("aria-expanded", "true"); qrBtn.textContent = "Hide QR code";
    } catch { say("The QR code could not be drawn here. Copy the link instead."); }
    finally { qrBtn.removeAttribute("aria-busy"); }
  });
  return { element: root, destroy() { root.remove(); } };
}
