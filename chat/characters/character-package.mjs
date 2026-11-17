// Rich character package review: the pure, bounded reader and structured preview for a producer package (a Cosmogenitor
// "authored profile" bundle, T415 / cosmogenitor/bundle/0). Board task T222, phase A.
//
// Pure: no DOM, no storage, no network, no clock, no model, no eval. Reading and reviewing never write anything and never
// admit anything. Phase B (the local writer: plc.characters.v1, the plc-characters lock, the review UI) consumes the candidate.
//
//   checkPackageFileSize(size)                       -> { ok } | refusal      (a chosen file's size, BEFORE it is read)
//   reviewCharacterPackageFile(text, options)        -> Promise<{ ok: true, candidate } | { ok: false, code, message, errors? }>
//   readCharacterFragment(hash)                      -> null (no package in the address) | { ok: true, text } | refusal
//   reviewCharacterPackageFragment(hash, options)    -> null | the same result as the file route (bounds checked first)
//   encodeCharacterFragment(bundleText)              -> "#character=<base64url>"  (how a sender builds the link; tests and docs)
//   PURPOSES / CHARACTER_PACKAGE_LIMITS / CHARACTER_FRAGMENT_KEY
//
// This is NOT the simple "#preset=" route (chat/assistant/preset-candidate.mjs), which stays {id,name,prompt}. A rich package is
// opened by the vendored producer validators (chat/characters/vendor/t415, byte-exact, see SOURCE.json): safe JSON, duplicate keys,
// bundle root hash, byte digests, protected definitions, dependency closure and authored semantics all run there. Nothing is trusted
// because it advertises a version or a hash. The candidate keeps the verified transport, content, definitions, claims and resource
// bytes as structured data for the owning later tasks; nothing is appended to a prompt except the producer's own plain projection.
//
// Bytes: this module never fetches. Inline bytes are verified. External bytes need explicit trusted local adapters
// (`openExternal` and `hasherFactory`) supplied by the caller; without them an external asset refuses.

import { openAuthored, receivingFixture, LIMITS as PRODUCER_LIMITS } from './vendor/t415/contracts/authored-profiles/authored.mjs';
import { parsePresetCandidate } from '../assistant/preset-candidate.mjs';

const producerFileMax = PRODUCER_LIMITS.maxMetadataBytes + Math.ceil(PRODUCER_LIMITS.maxInlineTotalBytes / 3) * 4 + 1024;
const FRAGMENT_DECODED_BYTES = 48 * 1024;
const FRAGMENT_VALUE_CHARS = Math.ceil(FRAGMENT_DECODED_BYTES * 4 / 3);

export const CHARACTER_FRAGMENT_KEY = 'character';
export const CHARACTER_PACKAGE_LIMITS = Object.freeze({
  fileBytes: producerFileMax, // the producer's own file bound: metadata + inline bytes in base64
  fragmentDecodedBytes: FRAGMENT_DECODED_BYTES,
  fragmentValueChars: FRAGMENT_VALUE_CHARS,
  fragmentEnvelopeChars: FRAGMENT_VALUE_CHARS + 512, // whole fragment, including the key and other parameters
  producer: PRODUCER_LIMITS,
});

// Purposes. `fresh` makes a new local individual from an authored design. `copy` is an explicit copy of an already installed authored
// design, again a fresh local individual (never archive continuation). `update` replaces the design of ONE explicitly selected local
// record. Neither matches a life by name, id, preset id, design id or hash. Everything else refuses.
export const PURPOSES = Object.freeze({
  fresh: { supported: true, individual: 'new' },
  copy: { supported: true, individual: 'new', needs: 'installed-design' },
  update: { supported: true, individual: 'selected', needs: 'selected-record' },
});
const REFUSED_PURPOSES = new Set(['continue', 'continuation', 'attach', 'attach-existing', 'move-authoritative-host', 'host-movement', 'report-memory', 'reported-experience', 'archive-as-new', 'restore']);

const refuse = (code, message, errors) => ({ ok: false, code, message, ...(errors ? { errors } : {}) });
const BASE64URL = /^[A-Za-z0-9_-]*$/;
const KEY_AT_START_OR_AFTER_AMP = new RegExp('(^|&)' + CHARACTER_FRAGMENT_KEY + '=');
const BAD_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/;
const byteLength = (text) => new TextEncoder().encode(text).length;
const OPAQUE_ID = /^[A-Za-z0-9:_.-]{1,200}$/;

function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
const clone = (value) => deepFreeze(JSON.parse(JSON.stringify(value)));

/** A chosen file's size, checked before it is read. */
export function checkPackageFileSize(size) {
  if (!Number.isSafeInteger(size) || size < 0) return refuse('not-json', 'This is not a character package file.');
  if (size > CHARACTER_PACKAGE_LIMITS.fileBytes) return refuse('too-large', 'This is too large to be a character package (more than ' + Math.round(CHARACTER_PACKAGE_LIMITS.fileBytes / 1024) + ' KB). Nothing was added.');
  return { ok: true };
}

function checkText(text) {
  if (typeof text !== 'string') return refuse('not-json', 'This is not a character package file.');
  if (text.length > CHARACTER_PACKAGE_LIMITS.fileBytes || byteLength(text) > CHARACTER_PACKAGE_LIMITS.fileBytes) return refuse('too-large', 'This is too large to be a character package. Nothing was added.');
  return { ok: true };
}

/** The package text an address fragment carries (`#character=<base64url>`), bounded before anything is split, decoded or parsed. */
export function readCharacterFragment(hash) {
  const fragment = String(hash || '').replace(/^#/, '');
  if (!KEY_AT_START_OR_AFTER_AMP.test(fragment)) return null;
  if (fragment.length > CHARACTER_PACKAGE_LIMITS.fragmentEnvelopeChars) return refuse('too-large', 'This link is too long to carry a character package. Open the package file instead. Nothing was added.');
  const values = new URLSearchParams(fragment).getAll(CHARACTER_FRAGMENT_KEY);
  if (!values.length) return null;
  if (values.length > 1) return refuse('ambiguous', 'This link carries more than one package. Nothing was added.');
  const raw = values[0];
  if (raw.length > CHARACTER_PACKAGE_LIMITS.fragmentValueChars) return refuse('too-large', 'This link is too long to carry a character package. Open the package file instead. Nothing was added.');
  if (!raw || !BASE64URL.test(raw) || raw.length % 4 === 1) return refuse('not-json', 'This link does not carry a readable character package. Nothing was added.');
  let text;
  try {
    const binary = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch { return refuse('not-json', 'This link does not carry a readable character package. Nothing was added.'); }
  // A fragment is a small metadata-only route: bytes never travel in an address.
  let value;
  try { value = JSON.parse(text); } catch { return refuse('not-json', 'This link does not carry a readable character package. Nothing was added.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.assets)) return refuse('not-a-package', 'This link does not carry a character package. Nothing was added.');
  if (value.assets.some((a) => !a || typeof a !== 'object' || a.status !== 'missing' || a.data !== undefined)) return refuse('fragment-assets', 'A link cannot carry resource bytes. Open the package file to add a package with resources. Nothing was added.');
  return { ok: true, text };
}

export function encodeCharacterFragment(bundleText) {
  const bytes = new TextEncoder().encode(bundleText);
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return '#' + CHARACTER_FRAGMENT_KEY + '=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const CAPABILITIES = [
  { key: 'lore', definition: 'authored:lore-v1', owner: 'T429', what: 'selected authored context' },
  { key: 'guidance', definition: 'authored:guidance-v1', owner: 'T442', what: 'generative guidance and labelled examples' },
  { key: 'prepared', definition: 'authored:prepared-v1', owner: 'T455', what: 'prepared states and offered variants' },
  { key: 'presentation', definition: 'authored:presentation-v1', owner: 'T444', what: 'app-owned presentation vocabulary' },
  { key: 'media', definition: 'authored:media-v1', owner: 'T456', what: 'declared media resources' },
  { key: 'evidence', definition: 'authored:evidence-v1', owner: 'T428/T418', what: 'authored seeds and source-labelled reports' },
];
const DESIGN_DEFINITION = 'authored:identity-v1';

function previewOf(asset, bytes) {
  if (!bytes) return { kind: 'unavailable' };
  const type = String(asset.mediaType || '');
  if (type === 'text/plain') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return BAD_TEXT.test(text) ? { kind: 'refused-text', reason: 'unsafe-characters' } : { kind: 'text', text };
    } catch { return { kind: 'refused-text', reason: 'not-utf-8' }; }
  }
  const signature = type === 'image/png' ? [0x89, 0x50, 0x4e, 0x47] : type === 'audio/wav' ? [0x52, 0x49, 0x46, 0x46] : null;
  const matches = signature ? signature.every((b, i) => bytes[i] === b) : null;
  return { kind: type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : 'binary', mediaType: type, size: bytes.byteLength, signatureMatches: matches };
}

function reviewFailure(error) {
  const errors = error?.errors;
  if (Array.isArray(errors) && errors.length) return refuse(String(errors[0].code || 'invalid'), 'The package was refused: ' + String(errors[0].message || 'it is not valid') + ' Nothing was added.', errors.map((e) => ({ code: e.code, path: e.path, message: e.message })));
  return refuse('invalid', 'The package could not be read. Nothing was added.');
}

async function review(text, { purpose = 'fresh', subjectId, targetIndividualId, route, crypto, openExternal, hasherFactory } = {}) {
  // 1. Purpose first: no continuation-like purpose ever reaches package work.
  if (typeof purpose !== 'string' || REFUSED_PURPOSES.has(purpose) || !Object.hasOwn(PURPOSES, purpose)) return refuse('purpose', 'This purpose is not supported: an authored package makes a new character or updates one you choose, and never continues a life. Nothing was added.');
  if (purpose === 'update') {
    if (typeof targetIndividualId !== 'string' || !OPAQUE_ID.test(targetIndividualId)) return refuse('target', 'Updating needs one explicitly chosen saved character. Nothing was added.');
  } else if (targetIndividualId !== undefined) return refuse('target', 'Only an update names an existing character. Nothing was added.');
  const sizeCheck = checkText(text);
  if (!sizeCheck.ok) return sizeCheck;

  // 2. The producer's own validation: safe JSON, root, bytes, definitions, closure, authored semantics.
  const adapters = { crypto, openExternal, hasherFactory };
  let opened;
  try { opened = await openAuthored(text, adapters); } catch (error) { return reviewFailure(error); }

  // 3. Subject selection. A package may carry several subjects (dependencies); exactly one is the character.
  const selected = opened.selection?.kind === 'subject' ? opened.selection.ids : [];
  const chosen = subjectId ?? (selected.length === 1 ? selected[0] : undefined);
  const subject = opened.document.subjects?.find((s) => s.id === chosen);
  if (!subject) return refuse('subject', 'Choose which character in this package to review.', (opened.document.subjects || []).map((s) => ({ code: 'subject-option', path: s.id, message: s.label })));

  // 4. Receiving support, from the producer's reverifying projection (never a trusted report from the caller).
  let received;
  try { received = await receivingFixture(text, { target: 'plc', subjectId: subject.id, purpose: 'fresh-design', route: 'file', ...adapters }); } catch (error) { return reviewFailure(error); }
  if (received.errors.length || !received.value) {
    const first = received.errors[0];
    return refuse(String(first?.code || 'unsupported'), 'This package needs something this version cannot provide' + (first ? ' (' + String(first.message || first.code) + ')' : '') + '. Nothing was added.', received.errors.map((e) => ({ code: e.code, path: e.path, message: e.message })));
  }
  // The plain projection must also pass the same text rules as any instructions this app keeps.
  const plain = parsePresetCandidate(JSON.stringify({ name: received.value.name, prompt: received.value.prompt }));
  if (!plain.ok) return refuse(plain.code, plain.message);

  // 5. Retain everything verified as structured data.
  const aspects = subject.aspects || [];
  const view = (aspect) => ({ id: aspect.id, definition: aspect.definition, version: aspect.value?.version, required: aspect.required === true, scope: aspect.scope, claims: aspect.claims || [], value: aspect.value });
  const capabilities = {};
  for (const c of CAPABILITIES) {
    const found = aspects.filter((a) => a.definition === c.definition);
    capabilities[c.key] = { present: found.length > 0, aspects: found.map((a) => a.id), owner: c.owner, what: c.what, status: found.length ? 'retained-structured' : 'absent', executionReady: false };
  }
  capabilities.guidance.adapters = [...new Set(aspects.filter((a) => a.definition === 'authored:guidance-v1').map((a) => a.value.adapter).filter(Boolean))];
  const known = new Set([...CAPABILITIES.map((c) => c.definition), DESIGN_DEFINITION, 'core:identity', 'core:dossier', 'core:communication']);
  const other = aspects.filter((a) => !known.has(a.definition));
  capabilities.other = { present: other.length > 0, aspects: other.map((a) => a.id), status: other.length ? 'transported-not-interpreted' : 'absent', executionReady: false };
  capabilities.text = { present: true, status: 'ready', detail: 'name and exact instructions from the producer plain projection' };

  const structured = {};
  for (const c of CAPABILITIES) structured[c.key] = clone(aspects.filter((a) => a.definition === c.definition).map(view));
  structured.other = clone(other.map(view));

  const designAspect = aspects.find((a) => a.definition === DESIGN_DEFINITION);
  const claims = [];
  for (const a of aspects.filter((x) => x.definition === 'authored:evidence-v1')) {
    for (const e of a.value.entries || []) {
      claims.push({ aspect: a.id, entry: e.id, standing: e.standing, source: e.source ?? null, occurrence: e.occurrence ?? null, individual: e.individual ?? null, run: e.run ?? null, participant: e.participant ?? null, audience: [...e.audience], verified: false, authority: 'none' });
    }
  }

  const assetRecords = (opened.document.assets || []).map((asset) => {
    const bytes = opened.inlineBytes.get(asset.sha256);
    const verified = Boolean(bytes) || opened.verifiedExternal.includes(asset.sha256);
    return { id: asset.id, mediaType: asset.mediaType, sha256: asset.sha256, size: asset.size, status: bytes ? 'verified-inline' : verified ? 'verified-external' : 'missing', preview: previewOf(asset, bytes) };
  });
  const bytesByHash = new Map([...opened.inlineBytes].map(([hash, bytes]) => [hash, new Uint8Array(bytes)]));

  const candidate = {
    kind: 'rich-character-package',
    route: route || 'file',
    purpose,
    individual: { assigned: false, individualId: null, mode: PURPOSES[purpose].individual, ...(purpose === 'update' ? { targetIndividualId } : {}), note: 'A local individual id is made by the local store when a person admits this; nothing in the package selects, matches or continues one.' },
    transport: deepFreeze({ format: 'cosmogenitor/bundle/0', root: JSON.parse(text).root, visibility: opened.visibility, audience: [...opened.audience], selection: JSON.parse(JSON.stringify(opened.selection)), bytes: byteLength(text) }),
    subject: deepFreeze({ id: subject.id, label: subject.label, summary: subject.summary ?? null, profiles: [...(subject.profiles || [])], requires: [...(subject.requires || [])] }),
    design: deepFreeze({ designId: designAspect?.value.designId ?? null, revision: designAspect?.value.revision ?? null, author: designAspect?.value.author ?? null, standing: designAspect?.value.standing ?? null, sourceCandidateId: received.value.id, note: 'Source design metadata and the source candidate id are unverified source claims, not local identity.' }),
    preview: deepFreeze({ name: plain.candidate.name, instructions: plain.candidate.prompt }),
    capabilities: deepFreeze(capabilities),
    omissions: clone(received.omissions),
    resources: clone(assetRecords.map((r) => { const { asset, ...rest } = received.resources.find((x) => x.asset === r.id) || {}; return { ...rest, ...r }; })),
    resourceReadiness: clone(received.resources),
    unverifiedSourceClaims: clone(claims),
    structured,
    package: { content: clone(opened.document), definitions: clone({ profiles: opened.registry.profiles, aspectDefinitions: opened.registry.aspectDefinitions }), receipts: clone(opened.receipts), supportReport: clone(opened.support ?? null) },
    resourceBytes: (hash) => { const b = bytesByHash.get(hash); return b ? new Uint8Array(b) : null; },
    admissionReady: false, // always: admission is the local store's transaction, after a person reviews this
    runtimeReady: false,
    persisted: false,
  };
  return { ok: true, candidate };
}

export async function reviewCharacterPackageFile(text, options = {}) {
  return review(text, { ...options, route: 'file' });
}

export async function reviewCharacterPackageFragment(hash, options = {}) {
  const read = readCharacterFragment(hash);
  if (read === null) return null;
  if (!read.ok) return read;
  return review(read.text, { ...options, route: 'fragment' });
}
