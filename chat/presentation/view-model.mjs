// Character presentation view model.
//
// Turns the two aspects Cosmogenitor's T415 profile defines, authored:presentation-v1 and authored:media-v1, plus the assets they point to, into ONE plain
// description of how a character should look, or says why PLC's own default look is used. Contract and answers: docs/contracts/character-presentation/.
//
// This module is pure: no DOM, no storage, no network, no clock, nothing imported. It is NOT a validator. The bundle and the aspects are validated by the
// shared authored-profiles package before anything reaches here; this module only refuses to use a value it does not understand, and names
// what it did not use, so a bad or newer package can never change how PLC looks beyond the closed vocabulary below.
//
// Closed v1 vocabulary (Cosmogenitor, T415): layout dialogue | folio; palette dusk | paper | sea. A palette is a NAME: the UI maps it to PLC's own tokens and
// keeps its own contrast, focus and reduced-motion rules. A package never supplies colours, CSS, HTML or script.
//
// Input
//   presentation: the value of authored:presentation-v1 for one scope, or null/undefined
//   media:        the value of authored:media-v1 for the same scope, or null/undefined
//   assets:       { [assetId]: { mediaType, size, sha256, verified: boolean } } for the assets of the bundle; `verified` is true only when the exact
//                 bytes were read and their SHA-256 matched the asset record (the opener does that, not this module)
//   scope:        'subject' (an agent) or 'context' (the scene); only used to label the result
// Output (frozen)
//   { scope, usesDefault, layout, palette, reducedMotion, alt, images: [...], omissions: [{ kind, id, reason }], refused: null | { reason } }
//   usesDefault is true when nothing of the package can be used (no presentation, or it was refused), and then every other field is the neutral default.

export const LAYOUTS = Object.freeze(["dialogue", "folio"]);
export const PALETTES = Object.freeze(["dusk", "paper", "sea"]);
export const IMAGE_TYPES = Object.freeze(["image/png", "image/webp", "image/jpeg"]);
/** Largest single image PLC will show (T415 allows 1 MiB for an external asset; inline assets are smaller). */
export const MAX_IMAGE_BYTES = 1024 * 1024;
const PURPOSE_ROLE = Object.freeze({ illustration: "portrait", background: "background" });
const NOT_SHOWN_PURPOSES = Object.freeze(["prepared-audio", "document"]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonBlank = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

function neutral(scope, refused, omissions) {
  return Object.freeze({
    scope, usesDefault: true, layout: null, palette: null, reducedMotion: false, alt: null,
    images: Object.freeze([]), omissions: Object.freeze(omissions.map((o) => Object.freeze(o))), refused: refused ? Object.freeze(refused) : null
  });
}

/** One media resource, or the reason it cannot be shown. Pure. */
function describeImage(resource, assets) {
  if (!isObject(resource)) return { shown: false, reason: "resource-not-an-object" };
  const id = typeof resource.asset === "string" ? resource.asset : null;
  if (!id) return { shown: false, reason: "resource-without-asset" };
  if (NOT_SHOWN_PURPOSES.includes(resource.purpose)) return { shown: false, id, reason: "purpose-not-supported-here" };
  const role = PURPOSE_ROLE[resource.purpose];
  if (!role) return { shown: false, id, reason: "unknown-purpose" };
  if (!nonBlank(resource.alt, 8192)) return { shown: false, id, reason: "missing-text-alternative" };
  if (!nonBlank(resource.author, 8192)) return { shown: false, id, reason: "missing-author" };
  if (!nonBlank(resource.license, 8192)) return { shown: false, id, reason: "missing-licence" };
  const asset = isObject(assets) && Object.prototype.hasOwnProperty.call(assets, id) ? assets[id] : null;
  if (!isObject(asset)) return { shown: false, id, reason: "asset-not-in-bundle" };
  if (asset.verified !== true) return { shown: false, id, reason: "asset-bytes-not-verified" };
  if (!IMAGE_TYPES.includes(asset.mediaType)) return { shown: false, id, reason: "unsupported-media-type" };
  if (!Number.isInteger(asset.size) || asset.size <= 0 || asset.size > MAX_IMAGE_BYTES) return { shown: false, id, reason: "image-size-out-of-bounds" };
  return {
    shown: true,
    image: Object.freeze({
      assetId: id, role, purpose: resource.purpose, alt: resource.alt, author: resource.author, license: resource.license,
      mediaType: asset.mediaType, size: asset.size, sha256: typeof asset.sha256 === "string" ? asset.sha256 : null,
      // PLC policy (T415 has no decorative flag in v1): a background is hidden from assistive technology, while its text alternative is still shown in the preview
      hideFromAssistiveTech: role === "background"
    })
  };
}

/**
 * Build the description for one scope. A required resource that cannot be shown refuses the presentation (not the character): the result is the neutral
 * default with a named reason. An optional resource that cannot be shown is a named omission and the rest is used.
 */
export function buildPresentationView({ presentation = null, media = null, assets = {}, scope = "subject" } = {}) {
  const omissions = [];
  if (presentation === null || presentation === undefined) return neutral(scope, null, []);
  if (!isObject(presentation)) return neutral(scope, { reason: "presentation-not-an-object" }, []);
  if (presentation.version !== "1.0.0") return neutral(scope, { reason: "presentation-version-not-supported" }, []);

  let layout = null;
  if (presentation.layout !== undefined) {
    if (LAYOUTS.includes(presentation.layout)) layout = presentation.layout;
    else omissions.push({ kind: "layout", id: String(presentation.layout).slice(0, 64), reason: "unknown-value" });
  }
  let palette = null;
  if (presentation.palette !== undefined) {
    if (PALETTES.includes(presentation.palette)) palette = presentation.palette;
    else omissions.push({ kind: "palette", id: String(presentation.palette).slice(0, 64), reason: "unknown-value" });
  }
  const reducedMotion = presentation.reducedMotion === true;
  const alt = nonBlank(presentation.alt, 8192) ? presentation.alt : null;
  if (presentation.alt !== undefined && alt === null) omissions.push({ kind: "alt", id: "presentation", reason: "invalid-text-alternative" });

  // which assets the presentation uses (all of them when it names none) and what media says about each
  let resources = [];
  if (media !== null && media !== undefined) {
    if (!isObject(media) || media.version !== "1.0.0" || !Array.isArray(media.resources)) return neutral(scope, { reason: "media-not-supported" }, omissions);
    resources = media.resources;
  }
  const named = Array.isArray(presentation.assets) ? presentation.assets.filter((a) => typeof a === "string") : null;
  const described = new Set(resources.filter(isObject).map((r) => r.asset));
  if (named) for (const id of named) if (!described.has(id)) omissions.push({ kind: "asset", id: id.slice(0, 128), reason: "no-media-description" });

  const images = [];
  for (const resource of resources) {
    if (named && isObject(resource) && !named.includes(resource.asset)) continue; // described but not used by this presentation
    const d = describeImage(resource, assets);
    if (d.shown) { images.push(d.image); continue; }
    const required = isObject(resource) && resource.required === true;
    if (required && !NOT_SHOWN_PURPOSES.includes(resource.purpose)) return neutral(scope, { reason: "required-asset-unavailable:" + d.reason, asset: d.id || null }, omissions);
    omissions.push({ kind: "asset", id: d.id || "unknown", reason: d.reason });
  }

  const usable = layout !== null || palette !== null || images.length > 0 || alt !== null;
  return Object.freeze({
    scope, usesDefault: !usable, layout, palette, reducedMotion, alt, images: Object.freeze(images),
    omissions: Object.freeze(omissions.map((o) => Object.freeze(o))), refused: null
  });
}

/**
 * The description for a character: the agent's own (subject scope) and the scene's (context scope), each falling back on its own. `aspects` is
 * { subject: { presentation, media }, context: { presentation, media } }; either part may be missing.
 */
export function buildCharacterPresentation({ aspects = {}, assets = {} } = {}) {
  const part = (scope) => buildPresentationView({ presentation: aspects?.[scope]?.presentation ?? null, media: aspects?.[scope]?.media ?? null, assets, scope });
  return Object.freeze({ agent: part("subject"), scene: part("context") });
}
