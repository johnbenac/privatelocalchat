// The record of a character look that a person chose to keep for a preset (docs/PRESENTATION-CHOICE-PLAN.md). Pure: no DOM, storage or clock.
//
// A record holds what the view model produced and nothing else of the package: layout and palette NAMES (closed lists), the pictures with their text alternative, author and licence, the
// person's choices (the whole look off, or one part off), and where it came from. It is checked again on EVERY read (checkRecord): what is stored may be damaged, hand-edited or written by
// a newer version, and none of that may reach the page as anything but the default look with a named reason. The stored text is never rewritten by a read.
//
//   { v: 1, enabled, off: { layout, palette, portrait, background }, source: { id, label },
//     look: { layout|null, palette|null, alt|null, reducedMotion }, images: [{ assetId, role, alt, author, license, mediaType, size, sha256, data }] }   data = base64 of the picture bytes
import { IMAGE_TYPES, LAYOUTS, PALETTES } from "./view-model.mjs";

export const RECORD_FORMAT = 1;
/** T415's inline caps (64 KiB for one picture, 256 KiB for all); PLC never fetches an external picture, so nothing larger can arrive. */
export const RECORD_LIMITS = Object.freeze({ imageBytes: 64 * 1024, totalBytes: 256 * 1024, images: 8, label: 200, id: 200, text: 8192, assetId: 128 });
const ROLES = Object.freeze(["portrait", "background"]);
const PARTS = Object.freeze(["layout", "palette", "portrait", "background"]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const SHA = /^sha256:[a-f0-9]{64}$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const bad = (reason) => ({ ok: false, reason });

export function toBase64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
export function fromBase64(data) { const s = atob(data); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
const decodedLength = (data) => (data.length / 4) * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);

function checkImage(image, seen) {
  if (!isObject(image)) return bad("image-not-an-object");
  if (!text(image.assetId, RECORD_LIMITS.assetId) || seen.has(image.assetId)) return bad("image-id");
  if (!ROLES.includes(image.role)) return bad("image-role");
  if (!text(image.alt, RECORD_LIMITS.text) || !text(image.author, RECORD_LIMITS.text) || !text(image.license, RECORD_LIMITS.text)) return bad("image-text");
  if (!IMAGE_TYPES.includes(image.mediaType)) return bad("image-type");
  if (!Number.isInteger(image.size) || image.size <= 0 || image.size > RECORD_LIMITS.imageBytes) return bad("image-size");
  if (typeof image.sha256 !== "string" || !SHA.test(image.sha256)) return bad("image-hash");
  if (typeof image.data !== "string" || image.data.length % 4 !== 0 || !BASE64.test(image.data) || decodedLength(image.data) !== image.size) return bad("image-data");
  seen.add(image.assetId);
  return { ok: true, image: Object.freeze({ assetId: image.assetId, role: image.role, alt: image.alt, author: image.author, license: image.license, mediaType: image.mediaType, size: image.size, sha256: image.sha256, data: image.data }) };
}

/** A stored value -> { ok: true, record } (a sanitised, frozen copy: unknown fields are not carried) | { ok: false, reason }. A record of a newer format is `newer`, never "damaged". */
export function checkRecord(value) {
  if (!isObject(value)) return bad("not-an-object");
  if (Number.isInteger(value.v) && value.v > RECORD_FORMAT) return bad("newer");
  if (value.v !== RECORD_FORMAT) return bad("format");
  if (typeof value.enabled !== "boolean") return bad("enabled");
  if (!isObject(value.off) || PARTS.some((p) => typeof value.off[p] !== "boolean")) return bad("off");
  if (!isObject(value.source) || !text(value.source.id, RECORD_LIMITS.id) || !text(value.source.label, RECORD_LIMITS.label)) return bad("source");
  const look = value.look;
  if (!isObject(look)) return bad("look");
  if (look.layout !== null && !LAYOUTS.includes(look.layout)) return bad("layout");
  if (look.palette !== null && !PALETTES.includes(look.palette)) return bad("palette");
  if (look.alt !== null && !text(look.alt, RECORD_LIMITS.text)) return bad("alt");
  if (typeof look.reducedMotion !== "boolean") return bad("reduced-motion");
  if (!Array.isArray(value.images) || value.images.length > RECORD_LIMITS.images) return bad("images");
  const seen = new Set(), images = []; let total = 0;
  for (const raw of value.images) { const r = checkImage(raw, seen); if (!r.ok) return r; total += r.image.size; images.push(r.image); }
  if (total > RECORD_LIMITS.totalBytes) return bad("images-total");
  return { ok: true, record: Object.freeze({
    v: RECORD_FORMAT, enabled: value.enabled, off: Object.freeze(Object.fromEntries(PARTS.map((p) => [p, value.off[p]]))),
    source: Object.freeze({ id: value.source.id, label: value.source.label }),
    look: Object.freeze({ layout: look.layout, palette: look.palette, alt: look.alt, reducedMotion: look.reducedMotion }), images: Object.freeze(images)
  }) };
}

/**
 * A new record from a character as the opener described it ({ id, label, view }) and the bytes the validator verified (assetBytes: Map(assetId -> Uint8Array)).
 * Only a look that can actually be used is kept: a refused presentation or the default has nothing to keep.
 */
export function makeRecord({ character, assetBytes }) {
  const view = character?.view;
  if (!view || view.usesDefault || view.refused) return bad("nothing-to-keep");
  const images = [];
  for (const image of view.images) {
    const bytes = assetBytes?.get(image.assetId);
    if (!(bytes instanceof Uint8Array) || bytes.length !== image.size) return bad("image-bytes");
    images.push({ assetId: image.assetId, role: image.role, alt: image.alt, author: image.author, license: image.license, mediaType: image.mediaType, size: image.size, sha256: image.sha256, data: toBase64(bytes) });
  }
  const label = typeof character.label === "string" && character.label.trim() ? character.label.slice(0, RECORD_LIMITS.label) : "Character";
  const id = typeof character.id === "string" && character.id.trim() ? character.id.slice(0, RECORD_LIMITS.id) : label;
  const checked = checkRecord({
    v: RECORD_FORMAT, enabled: true, off: { layout: false, palette: false, portrait: false, background: false }, source: { id, label },
    look: { layout: view.layout, palette: view.palette, alt: view.alt, reducedMotion: view.reducedMotion === true }, images
  });
  return checked.ok ? checked : bad("too-large:" + checked.reason);
}

/** A copy of a record with one choice changed: { enabled } or { off: { layout|palette|portrait|background: boolean } }. Anything else is refused. */
export function withChoice(record, choice) {
  if (!isObject(choice)) return bad("choice");
  const next = { ...record, off: { ...record.off }, images: record.images.slice() };
  if ("enabled" in choice) { if (typeof choice.enabled !== "boolean") return bad("choice"); next.enabled = choice.enabled; }
  if ("off" in choice) {
    if (!isObject(choice.off)) return bad("choice");
    for (const [part, value] of Object.entries(choice.off)) { if (!PARTS.includes(part) || typeof value !== "boolean") return bad("choice"); next.off[part] = value; }
  }
  return checkRecord(next);
}

/**
 * What to draw for a record now: the neutral description when there is no record, it is disabled, or it was not usable; otherwise the kept look minus the parts the person turned off.
 * `bytes` of each picture are decoded here for the caller to draw. Never throws.
 */
export function describeRecord(stored) {
  const neutral = (reason) => Object.freeze({ usesDefault: true, reason, layout: null, palette: null, alt: null, reducedMotion: false, images: Object.freeze([]), label: null });
  if (stored == null) return neutral("none");
  const checked = checkRecord(stored);
  if (!checked.ok) return neutral("unusable:" + checked.reason);
  const r = checked.record;
  if (!r.enabled) return neutral("disabled");
  const layout = r.off.layout ? null : r.look.layout, palette = r.off.palette ? null : r.look.palette;
  const images = [];
  for (const image of r.images) {
    if (r.off[image.role]) continue;
    let bytes; try { bytes = fromBase64(image.data); } catch { continue; }
    if (bytes.length !== image.size) continue;
    images.push(Object.freeze({ assetId: image.assetId, role: image.role, alt: image.alt, author: image.author, license: image.license, mediaType: image.mediaType, size: image.size, sha256: image.sha256, hideFromAssistiveTech: image.role === "background", bytes }));
  }
  const usable = layout !== null || palette !== null || images.length > 0;
  if (!usable) return neutral("all-parts-off");
  return Object.freeze({ usesDefault: false, reason: null, layout, palette, alt: r.look.alt, reducedMotion: r.look.reducedMotion, images: Object.freeze(images), label: r.source.label });
}

/** Does every picture's text hash to what its record says? `digest(bytes) -> Promise<"sha256:…">` is passed in (Web Crypto in the page, node:crypto in tests). */
export async function verifyRecordHashes(record, digest) {
  for (const image of record.images) { if ((await digest(fromBase64(image.data))) !== image.sha256) return { ok: false, assetId: image.assetId }; }
  return { ok: true };
}
