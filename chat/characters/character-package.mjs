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
// opened by the vendored producer validators (vendor/authored-profiles, the shared package, pinned in vendor.lock.json): safe JSON, duplicate keys,
// bundle root hash, byte digests, protected definitions, dependency closure and authored semantics all run there. Nothing is trusted
// because it advertises a version or a hash. The candidate keeps the verified transport, content, definitions, claims and resource
// bytes as structured data for the owning later tasks; nothing is appended to a prompt except the producer's own plain projection.
//
// Bytes: this module never fetches. Inline bytes are verified. External bytes need explicit trusted local adapters
// (`openExternal` and `hasherFactory`) supplied by the caller; without them an external asset refuses.

import { openAuthored, receivingFixture, LIMITS as PRODUCER_LIMITS } from '../../vendor/authored-profiles/neutral/rich.mjs';
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

// ---- exact bytes, serialisable source -------------------------------------------------------------------------------------------
// The producer verifies external bytes by streaming them through a hasher and keeps nothing. A receiver that says "verified" must still
// HOLD those bytes (a stored character cannot depend on a stream that is gone), so the stream the producer reads is tee'd here, bounded,
// while it is actually being verified: the retained bytes ARE the bytes the producer hashed (copies made as each chunk arrives), and the
// second verification pass (the receiving projection reopens the package) reads the retained copy, never the caller again. No address in
// the package is ever fetched; the caller's own opener is the only source.
const toError = (code, path, message) => Object.assign(new Error(message), { errors: [{ code, path, message }] });
const concatBytes = (chunks, size) => { const out = new Uint8Array(size); let at = 0; for (const c of chunks) { out.set(c, at); at += c.byteLength; } return out; };

function captureExternal(openExternal) {
  const captured = new Map();
  let total = 0;
  const open = typeof openExternal !== 'function' ? openExternal : async (hash) => {
    const stream = await openExternal(hash);
    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') return stream; // the producer refuses this itself
    return (async function* () {
      const chunks = []; let size = 0;
      for await (const chunk of stream) {
        if (!(chunk instanceof Uint8Array)) throw toError('bytes', hash, 'External chunks must be Uint8Array values.');
        size += chunk.byteLength;
        if (size > PRODUCER_LIMITS.maxExternalAssetBytes || total + size > PRODUCER_LIMITS.maxExternalTotalBytes) throw toError('external-limit', hash, 'External bytes exceed the bound.');
        const own = new Uint8Array(chunk); // a copy now: a source that reuses its buffer cannot change what was kept
        chunks.push(own);
        yield new Uint8Array(own);
      }
      total += size;
      captured.set(hash, concatBytes(chunks, size));
    })();
  };
  return { open, captured };
}

/** A hasher that holds the (bounded) bytes and digests them once with Web Crypto: an implementation independent of the caller's hasher. */
function bufferingHasher(crypto) {
  return () => {
    const chunks = []; let size = 0;
    return {
      update(chunk) { size += chunk.byteLength; chunks.push(new Uint8Array(chunk)); },
      digest: async () => new Uint8Array(await crypto.subtle.digest('SHA-256', concatBytes(chunks, size))),
    };
  };
}
const retainedOpener = (bytesByHash) => async (hash) => {
  const bytes = bytesByHash.get(hash);
  if (!bytes) throw toError('external-bytes', hash, 'No retained bytes for this resource.');
  return (async function* () { yield new Uint8Array(bytes); })();
};

const toBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 16384) s += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(s); };
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export const encodeBytes = toBase64;
export const decodeBytes = fromBase64;

/**
 * The complete verified original transport, serialisable: the bundle envelope exactly as received (format, selection, visibility, audience,
 * content, definitions, receipts, record manifest, asset byte manifest with each descriptor's status, root) without inline `data`, and the exact
 * verified bytes of every retained asset, base64. `bundleTextFromSource` rebuilds a bundle the producer validators open again, whatever the
 * route the bytes first arrived by.
 */
function serialSource(envelope, bytesByHash) {
  const meta = JSON.parse(JSON.stringify(envelope));
  for (const entry of meta.assets) delete entry.data;
  return { format: meta.format, root: meta.root, envelope: meta, bytes: [...bytesByHash].sort(([a], [b]) => (a < b ? -1 : 1)).map(([hash, bytes]) => ({ hash, size: bytes.byteLength, data: toBase64(bytes) })) };
}

const SOURCE_HASH = /^sha256:[a-f0-9]{64}$/;
const BASE64_TEXT = /^[A-Za-z0-9+/]*={0,2}$/;
/** The decoded size of base64 text, computed from its length alone (nothing is decoded), or -1 when it is not canonical base64. */
export function base64DecodedSize(data) {
  if (typeof data !== 'string' || data.length % 4 || !BASE64_TEXT.test(data)) return -1;
  const pad = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - pad;
}
/**
 * Structural bounds of a stored or reopened source, checked BEFORE any base64 is decoded, any text is built or any producer validator runs: the
 * counts, every size against the producer's own bounds, the byte text against its declared size, and that the bytes are exactly those the asset
 * byte manifest says are retained. Returns null when it holds, else a short reason. Nothing here proves the package; the producer validators do.
 */
export function checkSourceBounds(source) {
  const L = PRODUCER_LIMITS;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return 'source';
  if (source.format !== 'cosmogenitor/bundle/0' || typeof source.root !== 'string' || !SOURCE_HASH.test(source.root)) return 'source';
  const envelope = source.envelope;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || !Array.isArray(envelope.assets) || !Array.isArray(source.bytes)) return 'source';
  if (envelope.root !== source.root || envelope.format !== source.format) return 'source';
  if (envelope.assets.length > L.maxEntries || source.bytes.length > L.maxEntries) return 'source-limit';
  const need = new Map();
  for (const a of envelope.assets) {
    if (!a || typeof a !== 'object' || typeof a.hash !== 'string' || !SOURCE_HASH.test(a.hash) || !Number.isSafeInteger(a.size) || a.size < 0 || !['inline', 'external', 'missing'].includes(a.status) || a.data !== undefined) return 'asset manifest';
    if (a.size > L.maxExternalAssetBytes || (a.status === 'inline' && a.size > L.maxInlineAssetBytes)) return 'source-limit';
    if (a.status !== 'missing') need.set(a.hash, a.size);
  }
  let total = 0;
  const have = new Set();
  for (const b of source.bytes) {
    if (!b || typeof b !== 'object' || typeof b.hash !== 'string' || have.has(b.hash) || need.get(b.hash) !== b.size) return 'resource bytes';
    total += b.size;
    if (total > L.maxExternalTotalBytes + L.maxInlineTotalBytes) return 'source-limit';
    if (typeof b.data !== 'string' || b.data.length > Math.ceil(b.size / 3) * 4) return 'resource bytes';
    if (base64DecodedSize(b.data) !== b.size) return 'resource bytes';
    have.add(b.hash);
  }
  if (have.size !== need.size) return 'resource bytes';
  return null;
}

export function bundleTextFromSource(source) {
  const bad = checkSourceBounds(source);
  if (bad) throw toError(bad, '', 'This stored package is not complete or is larger than allowed.');
  const byHash = new Map(source.bytes.map((b) => [b.hash, b]));
  const bundle = JSON.parse(JSON.stringify(source.envelope));
  for (const entry of bundle.assets) {
    if (entry.status === 'inline') {
      const held = byHash.get(entry.hash);
      if (!held) throw toError('source', entry.hash, 'Stored bytes are missing.');
      entry.data = held.data;
    }
  }
  return JSON.stringify(bundle);
}

/** Open a stored source again through the same producer validators: root, bytes, definitions, closure, semantics. Never fetches. */
export async function reopenCharacterSource(source, { subjectId, crypto = globalThis.crypto, purpose = 'fresh' } = {}) {
  let text, bytes;
  try {
    text = bundleTextFromSource(source);
    bytes = new Map(source.bytes.map((b) => [b.hash, fromBase64(b.data)]));
  } catch (error) { return reviewFailure(error); }
  return review(text, { purpose, subjectId, crypto, openExternal: retainedOpener(bytes), hasherFactory: bufferingHasher(crypto), route: 'stored' });
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
  const tee = captureExternal(openExternal);
  let opened;
  try { opened = await openAuthored(text, { crypto, openExternal: tee.open, hasherFactory }); } catch (error) { return reviewFailure(error); }

  // 2b. Every byte object the producer called verified is held: inline from the file, external from the stream it just hashed.
  // The second pass below reads these held copies (hashed again with an independent digest), so the caller's stream is read once.
  const bytesByHash = new Map();
  for (const [hash, bytes] of opened.inlineBytes) bytesByHash.set(hash, new Uint8Array(bytes));
  for (const hash of opened.verifiedExternal) {
    const held = tee.captured.get(hash);
    if (!held) return refuse('external-bytes', 'A resource was verified but its bytes could not be kept. Nothing was added.');
    bytesByHash.set(hash, held);
  }
  const adapters = tee.captured.size ? { crypto, openExternal: retainedOpener(bytesByHash), hasherFactory: bufferingHasher(crypto) } : { crypto, openExternal, hasherFactory };

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
    const bytes = bytesByHash.get(asset.sha256); // a resource is "verified" only when its exact bytes are held
    const status = !bytes ? 'missing' : opened.inlineBytes.has(asset.sha256) ? 'verified-inline' : 'verified-external';
    return { id: asset.id, mediaType: asset.mediaType, sha256: asset.sha256, size: asset.size, status, retained: Boolean(bytes), preview: previewOf(asset, bytes) };
  });
  const sourceEnvelope = JSON.parse(text);

  const candidate = {
    kind: 'rich-character-package',
    route: route || 'file',
    purpose,
    individual: { assigned: false, individualId: null, mode: PURPOSES[purpose].individual, ...(purpose === 'update' ? { targetIndividualId } : {}), note: 'A local individual id is made by the local store when a person admits this; nothing in the package selects, matches or continues one.' },
    transport: deepFreeze({ format: 'cosmogenitor/bundle/0', root: sourceEnvelope.root, visibility: opened.visibility, audience: [...opened.audience], selection: JSON.parse(JSON.stringify(opened.selection)), bytes: byteLength(text) }),
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
    source: deepFreeze(serialSource(sourceEnvelope, bytesByHash)),
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
