// A preset candidate: the small plain JSON { id, name, prompt } another program (Cosmogenitor's "plc-preset" handoff) can hand over as a file or as a link fragment.
// Pure: no DOM, no storage, no network, no clock. Reading and admitting are separate steps, and neither ever writes anything.
//
//   parsePresetCandidate(text)        -> { ok: true, candidate: { sourceId, name, prompt } } | { ok: false, code, message }
//   readPresetFragment(hash)          -> null (no preset in the address) | the same result for the text the fragment carries
//   encodePresetFragment(candidate)   -> "#preset=<base64url of the JSON>" (how a sender builds the link; the tests and docs/PRESET-IMPORT.md use it)
//   findPresetConflicts(presets, ...) -> what a new preset would collide with (names compare without case, spacing or accent-width differences)
//   admitPreset(presets, candidate, { makeId, keepSeparate }) -> { ok: true, list, preset } | { ok: false, code: 'conflict', conflicts }
//
// What is accepted is deliberately exact: three fields, `name` and `prompt` text (required) and `id` text (optional, kept only as "where it came from": the incoming id is never used
// as this device's id and never overwrites anything). Any other field is refused by name rather than dropped, because a field this reader does not know might carry a meaning the
// sender required. A backup, a rich profile, or anything with a credential-like field is refused whole with its own plain message. Sizes are checked before the text is parsed.

export const PRESET_LIMITS = Object.freeze({ fileBytes: 32 * 1024, fragmentChars: 12 * 1024, fragmentEnvelopeChars: 12 * 1024 + 256, nameChars: 120, promptChars: 8000, idChars: 200 });
export const PRESET_FRAGMENT_KEY = 'preset';

const ALLOWED = new Set(['id', 'name', 'prompt']);
const CREDENTIAL_KEY = /(token|secret|passw|passphrase|credential|authorization|api[-_ ]?key|bearer|private[-_ ]?key|endpoint|cookie)/i;
const RICH_KEY = /^(schema|\$schema|format|version|records|subjects?|aspects?|assets?|registry|relationships|receipts|threads|chats|conversations|memory|presets|folders|docs|documents|prefs|settings|design|place|resident|authored|profile|bundle)$/i;
// control characters (except tab, line feed, carriage return) and the invisible direction overrides that make text read differently from what it is
const BAD_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/;

const refuse = (code, message) => ({ ok: false, code, message });
const shown = (key) => '“' + String(key).replace(/[^\p{L}\p{N}_$.\- ]/gu, '?').slice(0, 30) + '”';

/** Name rules shared by the file reader and the review box (the person may edit the name before adding). -> { ok, name } | { ok: false, code, message } */
export function checkPresetName(value) {
  if (typeof value !== 'string') return refuse('bad-field', 'The preset name must be text.');
  if (BAD_TEXT.test(value)) return refuse('bad-text', 'The preset name has characters that cannot be shown safely.');
  if (/[\u2028\u2029]/.test(value)) return refuse('bad-field', 'The preset name must be on one line.'); // tested before trimming: trim() would remove one at either end
  const name = value.trim();
  if (!name) return refuse('missing', 'The preset has no name.');
  if (/[\r\n]/.test(name)) return refuse('bad-field', 'The preset name must be on one line.');
  if (name.length > PRESET_LIMITS.nameChars) return refuse('too-large', 'The preset name is longer than ' + PRESET_LIMITS.nameChars + ' characters.');
  return { ok: true, name };
}

const byteLength = (text) => new TextEncoder().encode(text).length;

export function parsePresetCandidate(text) {
  if (typeof text !== 'string') return refuse('not-json', 'This is not a preset file.');
  if (text.length > PRESET_LIMITS.fileBytes || byteLength(text) > PRESET_LIMITS.fileBytes) return refuse('too-large', 'This is too large to be a preset (more than ' + PRESET_LIMITS.fileBytes / 1024 + ' KB).');
  let value;
  try { value = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); } catch { return refuse('not-json', 'This is not a preset file: it is not valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return refuse('not-a-preset', 'This is not a preset: a preset is one JSON object with a name and instructions.');
  const keys = Object.keys(value);
  const credential = keys.find((k) => CREDENTIAL_KEY.test(k));
  if (credential) return refuse('credential', 'This file has a field that looks like a key, token or address for a service (' + shown(credential) + '). A preset is only a name and instructions, so nothing was added.');
  const rich = keys.find((k) => RICH_KEY.test(k) || (!ALLOWED.has(k) && value[k] && typeof value[k] === 'object'));
  if (rich) return refuse('unsupported', 'This looks like a backup or a richer character package (' + shown(rich) + '), which this importer does not read. Only a plain preset (name and instructions) can be added here, so nothing was added.');
  const unknown = keys.filter((k) => !ALLOWED.has(k));
  if (unknown.length) return refuse('unknown-fields', 'This preset has fields this version does not understand (' + unknown.slice(0, 5).map(shown).join(', ') + '). Nothing was added, so nothing is silently left out.');
  if (typeof value.name !== 'string' || typeof value.prompt !== 'string') return refuse(value.name === undefined || value.prompt === undefined ? 'missing' : 'bad-field', 'A preset needs a name and instructions, both as text.');
  if (value.id !== undefined && typeof value.id !== 'string') return refuse('bad-field', 'The preset id must be text.');
  if (typeof value.id === 'string' && (BAD_TEXT.test(value.id) || value.id.length > PRESET_LIMITS.idChars)) return refuse('bad-field', 'The preset id is not usable.');
  const name = checkPresetName(value.name);
  if (!name.ok) return name;
  if (BAD_TEXT.test(value.prompt)) return refuse('bad-text', 'The instructions have characters that cannot be shown safely.');
  if (!value.prompt.trim()) return refuse('missing', 'The preset has no instructions.');
  if (value.prompt.length > PRESET_LIMITS.promptChars) return refuse('too-large', 'The instructions are longer than ' + PRESET_LIMITS.promptChars + ' characters.');
  return { ok: true, candidate: { sourceId: typeof value.id === 'string' ? value.id : null, name: name.name, prompt: value.prompt } };
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;
const KEY_AT_START_OR_AFTER_AMP = new RegExp('(^|&)' + PRESET_FRAGMENT_KEY + '=');
/**
 * The preset an address fragment carries, as text decoded and parsed with the same limits; null when the address holds no preset at all.
 * The WHOLE fragment is measured first: one that is longer than the envelope (the preset limit plus room for the key and a few other parameters) and that
 * names a preset is refused as too large before it is split, decoded or parsed. A long fragment with no `preset=` in it is somebody else's and is left alone (null).
 */
export function readPresetFragment(hash) {
  const fragment = String(hash || '').replace(/^#/, '');
  if (!KEY_AT_START_OR_AFTER_AMP.test(fragment)) return null;
  if (fragment.length > PRESET_LIMITS.fragmentEnvelopeChars) return refuse('too-large', 'This link is too long to be a preset link. Nothing was added.');
  const values = new URLSearchParams(fragment).getAll(PRESET_FRAGMENT_KEY);
  if (!values.length) return null;
  if (values.length > 1) return refuse('ambiguous', 'This link carries more than one preset. Nothing was added.');
  const raw = values[0];
  if (raw.length > PRESET_LIMITS.fragmentChars) return refuse('too-large', 'This link is too long to be a preset link. Nothing was added.');
  if (!raw || !BASE64URL.test(raw) || raw.length % 4 === 1) return refuse('not-json', 'This link does not carry a readable preset. Nothing was added.');
  let text;
  try {
    const binary = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch { return refuse('not-json', 'This link does not carry a readable preset. Nothing was added.'); }
  return parsePresetCandidate(text);
}

export function encodePresetFragment(candidate) {
  const bytes = new TextEncoder().encode(JSON.stringify({ id: candidate.id ?? candidate.sourceId ?? undefined, name: candidate.name, prompt: candidate.prompt }));
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return '#' + PRESET_FRAGMENT_KEY + '=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const comparableName = (name) => String(name).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/** What adding { name, prompt } would collide with among `presets` (built-in and the person's own): same name, and whether the instructions are identical too. */
export function findPresetConflicts(presets, name, prompt) {
  const wanted = comparableName(name);
  const sameName = (presets || []).filter((p) => p && comparableName(p.name ?? '') === wanted);
  return { sameName, identical: sameName.some((p) => p.prompt === prompt), any: sameName.length > 0 };
}

/**
 * The rule a full backup's restore has always used for presets, as a pure step: an item with a name and instructions whose name (exactly) is not already one of the person's own
 * is added with a new id made here; nothing is replaced. -> { list, added }. (The built-in presets are not in `list`; the restore never compared with them.)
 */
export function mergeBackupPresets(list, items, makeId) {
  const next = Array.isArray(list) ? list.slice() : []; let added = 0;
  for (const p of Array.isArray(items) ? items : []) {
    if (p?.name && p.prompt && !next.some((x) => x.name === p.name)) { next.push({ id: makeId(), name: p.name, prompt: p.prompt }); added++; }
  }
  return { list: next, added };
}

/**
 * Add a candidate as a NEW preset. The id is always made here (makeId), never taken from the candidate, so nothing already stored is ever replaced.
 * A name that is already in use (or the same instructions again) is a conflict the caller must put to the person; { keepSeparate: true } is their explicit answer.
 */
export function admitPreset(presets, candidate, { makeId, keepSeparate = false } = {}) {
  const name = checkPresetName(candidate?.name);
  if (!name.ok) return name;
  if (typeof candidate.prompt !== 'string' || !candidate.prompt.trim() || candidate.prompt.length > PRESET_LIMITS.promptChars || BAD_TEXT.test(candidate.prompt)) return refuse('bad-field', 'The instructions are not usable.');
  const list = Array.isArray(presets) ? presets : [];
  const conflicts = findPresetConflicts(list, name.name, candidate.prompt);
  if (conflicts.any && !keepSeparate) return { ok: false, code: 'conflict', message: 'A preset with this name already exists.', conflicts };
  const taken = new Set(list.map((p) => p?.id));
  let id = makeId(), guard = 0;
  while ((!id || taken.has(id) || String(id).startsWith('builtin-')) && guard++ < 10) id = makeId();
  if (!id || taken.has(id) || String(id).startsWith('builtin-')) return refuse('no-id', 'A new preset id could not be made.');
  const preset = { id, name: name.name, prompt: candidate.prompt };
  return { ok: true, list: [...list, preset], preset };
}
