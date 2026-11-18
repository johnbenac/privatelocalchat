// Plain-language sentences for what the presentation view model and the package opener report. Pure text, no DOM.
// Every reason code that view-model.mjs or open-bundle.mjs can produce has a sentence here: tests/presentation-explain.test.mjs reads the source of both and fails when one is missing.
// Names inside the sentences (an asset id, a layout name) come from the package, which is untrusted: they are cut short, and the caller puts the text on the page as text, never as markup.

const cut = (value, max = 60) => { const s = String(value ?? ""); return s.length > max ? s.slice(0, max - 1) + "…" : s; };

/** What a layout name means (Cosmogenitor's definitions for authored:presentation-v1). */
export const LAYOUT_MEANING = Object.freeze({
  dialogue: "conversation first, with the speaker turns as the main surface",
  folio: "page-like: the character's material set as a document, with the conversation beside it"
});
/** What a palette name means: a name only. The app draws it with its own colours and keeps its own contrast and focus rules. */
export const PALETTE_MEANING = Object.freeze({ dusk: "dark and warm", paper: "light and neutral", sea: "cool, blue-green" });

const ASSET = Object.freeze({
  "purpose-not-supported-here": (id) => `“${cut(id)}” is audio or a document. This app does not play or show it here.`,
  "asset-not-in-bundle": (id) => `The package names “${cut(id)}” but does not contain it.`,
  "asset-bytes-not-verified": (id) => `The package does not contain the checked file for “${cut(id)}”.`,
  "unsupported-media-type": (id) => `“${cut(id)}” is not a PNG, WebP or JPEG picture.`,
  "image-size-out-of-bounds": (id) => `“${cut(id)}” is empty or larger than 1 MB.`,
  "missing-text-alternative": (id) => `“${cut(id)}” has no text description, so it is not shown.`,
  "missing-author": (id) => `“${cut(id)}” does not say who made it, so it is not shown.`,
  "missing-licence": (id) => `“${cut(id)}” does not say what licence it has, so it is not shown.`,
  "no-media-description": (id) => `The look names “${cut(id)}” but the package does not describe it (text description, author, licence), so it is not shown.`,
  "resource-not-an-object": () => "A picture entry in the package could not be understood.",
  "resource-without-asset": () => "A picture entry in the package does not say which file it is.",
  "unknown-purpose": (id) => `“${cut(id)}” has a purpose this app does not know.`
});

/** A sentence for a refusal of the whole presentation ({ reason, asset? }). The character is still in the package. */
export function explainRefusal(refused) {
  const reason = String(refused?.reason ?? "");
  const tail = " The app's own look is used instead; the character itself is still in the package.";
  if (reason.startsWith("required-asset-unavailable:")) {
    const why = reason.slice("required-asset-unavailable:".length);
    const make = ASSET[why];
    return "This look needs a picture that cannot be used. " + (make ? make(refused?.asset) : "It could not be shown.") + tail;
  }
  if (reason === "presentation-not-an-object") return "The look in this package could not be understood." + tail;
  if (reason === "presentation-version-not-supported") return "The look in this package is from a newer version than this app reads." + tail;
  if (reason === "media-not-supported") return "The pictures listed in this package are in a form this app does not read." + tail;
  return "The look in this package cannot be used." + tail;
}

/** A sentence for something left out ({ kind, id, reason }). */
export function explainOmission(omission) {
  const { kind, id, reason } = omission || {};
  if (kind === "asset") { const make = ASSET[reason]; return make ? make(id) : `“${cut(id)}” cannot be shown.`; }
  if (kind === "layout" || kind === "palette") return `The package asks for a ${kind} this app does not have (“${cut(id)}”), so the app's own is used.`;
  if (kind === "alt") return "The package's own description of the look is not usable, so it is not shown.";
  if (kind === "characters") return `${cut(id, 12)} more characters are in the package and are not shown.`;
  return "Something in the package was left out.";
}

/** A sentence for a package that could not be opened at all (the opener's { ok: false, reason }). */
export function explainOpenFailure(result) {
  if (result?.reason === "too-large") return "This file is too large to be a character package. Nothing was used.";
  if (result?.reason === "not-a-package") return "This is not a character package. Nothing was used.";
  return result?.message || "This package could not be opened. Nothing was used.";
}
