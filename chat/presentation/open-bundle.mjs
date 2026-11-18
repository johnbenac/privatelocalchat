// Open a Cosmogenitor character package and describe how each character in it would look (board T444, objective O133).
//
// This is the piece between the shared validator and the view model:
//   text of a file  ->  openAuthored (the shared authored-profiles package, T705: parses, checks the exact bytes against their SHA-256, checks the authored rules)
//                   ->  this module: finds each subject's presentation and media values, hands the view model only assets whose bytes the validator verified
//                   ->  buildPresentationView (chat/presentation/view-model.mjs)
//
// Pure: no DOM, storage, network or clock. The validator is PASSED IN (`openAuthored`), so nothing in a shipped module names a path inside vendor/authored-profiles (the caller that
// ships the vendored files imports it; tests import it from the repository). Nothing is stored, applied or fetched: the result is only what a preview would show.
//
// Result
//   { ok: false, reason, code?, message }   the file could not be used at all (the whole package is refused, e.g. one changed byte, which the validator refuses as a whole)
//   { ok: true, characters: [{ id, label, summary, view, otherAspects }], assetBytes, omissions }
//     view          the description from buildPresentationView for that character's own presentation (it may be the neutral default with a named refusal; the character is still listed)
//     otherAspects  the definition ids of the character's other parts; this module does not use them for presentation, and the preview names them rather than hiding them
//     assetBytes    Map(assetId -> Uint8Array) for the images a view actually shows (verified by the validator), for the preview to draw
//     omissions     things this module itself left out: more characters than MAX_CHARACTERS

import { buildPresentationView } from "./view-model.mjs";

/** A package file larger than this is refused before it is parsed (T415 inline assets are far smaller; the validator has its own bounds too). */
export const MAX_PACKAGE_CHARS = 2 * 1024 * 1024;
export const MAX_CHARACTERS = 64;
const PRESENTATION = "authored:presentation-v1", MEDIA = "authored:media-v1";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const refuse = (reason, extra = {}) => Object.freeze({ ok: false, reason, ...extra });
const plain = (value, max) => (typeof value === "string" ? value.slice(0, max) : null);

export async function openPresentationBundle(text, { openAuthored } = {}) {
  if (typeof openAuthored !== "function") throw new TypeError("openPresentationBundle needs the validator: { openAuthored }");
  if (typeof text !== "string" || !text.trim()) return refuse("not-a-package", { message: "This is not a character package." });
  if (text.length > MAX_PACKAGE_CHARS) return refuse("too-large", { message: "This file is too large to be a character package." });

  let opened;
  try { opened = await openAuthored(text); } catch (error) {
    const first = Array.isArray(error?.errors) ? error.errors[0] : null;
    return refuse("refused-by-validator", { code: plain(first?.code, 64) || plain(error?.name, 64) || "error", message: "This package could not be opened: it is not valid, or its contents do not match what it declares. Nothing was used." });
  }
  const document = opened?.document, verifiedBytes = opened?.inlineBytes;
  if (!isObject(document) || !(verifiedBytes instanceof Map) || !Array.isArray(document.subjects)) return refuse("unexpected-result", { message: "This package could not be read." });

  // assets the view model may use: only those whose exact bytes the validator verified, and whose size is what the record says
  const assets = {}, bytesOf = new Map();
  for (const record of Array.isArray(document.assets) ? document.assets : []) {
    if (!isObject(record) || typeof record.id !== "string") continue;
    const bytes = verifiedBytes.get(record.sha256);
    const verified = bytes instanceof Uint8Array && bytes.length === record.size;
    assets[record.id] = { mediaType: record.mediaType, size: record.size, sha256: record.sha256, verified };
    if (verified) bytesOf.set(record.id, bytes);
  }

  const omissions = [];
  const characters = [];
  for (const subject of document.subjects) {
    if (!isObject(subject)) continue;
    if (characters.length >= MAX_CHARACTERS) { omissions.push({ kind: "characters", id: String(document.subjects.length - MAX_CHARACTERS), reason: "more-than-shown" }); break; }
    const own = { presentation: null, media: null }, others = [];
    for (const aspect of Array.isArray(subject.aspects) ? subject.aspects : []) {
      if (!isObject(aspect) || typeof aspect.definition !== "string") continue;
      const subjectScope = !isObject(aspect.scope) || aspect.scope.kind === "subject";
      if (aspect.definition === PRESENTATION && subjectScope) own.presentation = aspect.value;
      else if (aspect.definition === MEDIA && subjectScope) own.media = aspect.value;
      else others.push(aspect.definition.slice(0, 128));
    }
    characters.push({
      id: plain(subject.id, 200), label: plain(subject.label, 200), summary: plain(subject.summary, 2000),
      view: buildPresentationView({ presentation: own.presentation, media: own.media, assets, scope: "subject" }),
      otherAspects: Object.freeze([...new Set(others)].sort())
    });
  }

  const assetBytes = new Map();
  for (const character of characters) for (const image of character.view.images) assetBytes.set(image.assetId, bytesOf.get(image.assetId));
  return Object.freeze({ ok: true, characters: Object.freeze(characters.map((c) => Object.freeze(c))), assetBytes, omissions: Object.freeze(omissions) });
}
